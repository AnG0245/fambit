import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtemp, rm, readFile, writeFile, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createAdminAuth, totp, base32, createRateLimiter} from '../selfhost/auth.mjs';
import {createFambitServer, serverConfig, clientIp} from '../selfhost/server.mjs';
import {createBackup, restoreBackup} from '../selfhost/backup.mjs';
import {provision} from '../selfhost/provision.mjs';
import {startMaintenance} from '../selfhost/maintenance.mjs';

const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // Published RFC 6238 fixture.
const password = 'Synthetic test password only 123456!';
const cookieHeader = value => value.split(';')[0];
const hash = value => createHash('sha256').update(value).digest('hex');

test('TOTP coincide con los vectores SHA-1 de RFC 6238', () => {
  assert.equal(base32(Buffer.from('12345678901234567890')), secret);
  for (const [seconds, expected] of [[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],[1234567890,'89005924'],[2000000000,'69279037'],[20000000000,'65353130']]) {
    assert.equal(totp(secret, seconds * 1000, 8), expected);
    assert.equal(totp(secret, seconds * 1000), expected.slice(-6));
  }
});

test('segundo factor obligatorio, protección de sesión, caducidad y no reutilización de códigos', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fambit-auth-')); let time = 1700000000000;
  const options = {user:'admin', password, secret, secure:true, directory, clock:() => time};
  try {
    assert.throws(() => createAdminAuth({...options, secret:''}), /TOTP/);
    const auth = createAdminAuth(options);
    assert.equal(auth.login({user:'admin',password,code:'bad'}), null);
    assert.equal(auth.login({user:'other',password,code:totp(secret,time)}), null);
    const cookie = auth.login({user:'admin',password,code:totp(secret,time)});
    assert.match(cookie, /^__Host-fambit_admin=[a-f0-9]{64};/);
    for (const flag of ['HttpOnly','Secure','SameSite=Strict','Path=/']) assert.ok(cookie.includes(flag));
    assert.ok(!cookie.includes(password)); assert.ok(!cookie.includes(secret));
    const req = {headers:{cookie:cookieHeader(cookie)}};
    assert.equal(auth.authenticated(req), true);
    assert.equal(auth.authenticated({headers:{cookie:'__Host-fambit_admin='+'a'.repeat(64)}}), false);
    assert.equal(auth.login({user:'admin',password,code:totp(secret,time)}), null);
    const restarted = createAdminAuth(options);
    assert.equal(restarted.authenticated(req), false);
    assert.equal(restarted.login({user:'admin',password,code:totp(secret,time)}), null);
    time += 31 * 60 * 1000;
    assert.equal(auth.authenticated(req), false);
    const second = {headers:{cookie:cookieHeader(auth.login({user:'admin',password,code:totp(secret,time)}))}};
    assert.equal(auth.authenticated(second), true);
    assert.match(auth.logout(second), /Max-Age=0/); assert.equal(auth.authenticated(second), false);
    time += 60000;
    const third = {headers:{cookie:cookieHeader(auth.login({user:'admin',password,code:totp(secret,time)}))}};
    // Keep the session active through its absolute eight-hour lifetime.
    for (let n=0; n<47; n++) { time += 10*60000; assert.equal(auth.authenticated(third), true); }
    time += 10*60000; assert.equal(auth.authenticated(third), false);
  } finally { await rm(directory, {recursive:true,force:true}); }
});

test('configuración de internet y límites sin confiar en cabeceras arbitrarias', () => {
  assert.throws(() => serverConfig({NODE_ENV:'production', NUBE_PUBLIC_ORIGIN:'http://127.0.0.1:8787'}), /HTTPS/);
  assert.throws(() => serverConfig({NUBE_PUBLIC_ORIGIN:'http://example.test'}), /HTTPS/);
  assert.throws(() => serverConfig({NUBE_PUBLIC_ORIGIN:'http://localhost:8787',NUBE_LISTEN_HOST:'0.0.0.0'}), /loopback/);
  assert.throws(() => serverConfig({NUBE_PUBLIC_ORIGIN:'https://example.test/api'}), /origen/);
  assert.throws(() => serverConfig({FAMBIT_DOWNLOAD_URL:'https://example.test/source.zip'}), /EXE/);
  assert.equal(serverConfig({RENDER_EXTERNAL_URL:'https://fixture.onrender.com',NODE_ENV:'production'}).origin, 'https://fixture.onrender.com');
  const req = {headers:{'x-forwarded-for':'198.51.100.25, 203.0.113.9'},socket:{remoteAddress:'127.0.0.1'}};
  assert.equal(clientIp(req,0),'127.0.0.1'); assert.equal(clientIp(req,1),'203.0.113.9');
  req.headers['x-forwarded-for']='198.51.100.100, 203.0.113.9'; assert.equal(clientIp(req,1),'203.0.113.9');
  let clock = 1000; const limited = createRateLimiter({clock:() => clock,capacity:1});
  assert.equal(limited('one',2),false); assert.equal(limited('one',2),false); assert.equal(limited('one',2),true);
  assert.equal(limited('many-new-addresses',2),true); // capacity does not clear active limits
  clock += 60001; assert.equal(limited('one',2),false);
});

test('HTTP: web pública, panel protegido, licencias remotas y copia restaurable', async t => {
  const root = await mkdtemp(join(tmpdir(), 'fambit-http-'));
  const data = join(root, 'data'), origin = 'https://fambit.example.test';
  const env = {PORT:'0',NUBE_LISTEN_HOST:'127.0.0.1',NUBE_PUBLIC_ORIGIN:origin,NODE_ENV:'production',NUBE_ADMIN_USER:'admin',NUBE_ADMIN_PASSWORD:password,FAMBIT_ADMIN_TOTP_SECRET:secret,NUBE_DATA_DIR:data,NUBE_ADMIN_OWNER:'local-test',FAMBIT_TRUST_PROXY_HOPS:'1'};
  let app, address, cookie, licenseId, key, token, familyId;
  async function start() { app=await createFambitServer(env); app.server.listen(0,'127.0.0.1'); await once(app.server,'listening'); address='http://127.0.0.1:'+app.server.address().port; }
  const call = (path, options={}) => fetch(address+path, {redirect:'manual',...options});
  const admin = (path, method='GET', data) => call(path, {method,headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
  const client = path => call(path, {headers:{Authorization:'Bearer '+token}});
  try {
    await start();
    await t.test('publica la presentación y exige autenticación para los datos', async () => {
      const home = await call('/'); assert.equal(home.status,200); assert.match(await home.text(), /Lanzamiento en preparación/);
      const health = await (await call('/healthz')).json(); assert.deepEqual(health, {service:'FAMBIT',status:'ok',apiVersion:1,production:true});
      const page = await call('/admin'); assert.equal(page.status,303); assert.equal(page.headers.get('location'),'/admin/login');
      for (const path of ['/api/licenses','/api/families','/api/releases','/api/client/families?revit=2025']) assert.equal((await call(path)).status,401);
      for (const path of ['/server-data/nube.sqlite','/.env','/selfhost/server.mjs','/downloads/FAMBIT-Prueba-Windows-0.3.0.zip']) assert.equal((await call(path)).status,404);
      assert.equal((await call('/portal.css')).status,200); assert.equal((await call('/login.js')).status,200);
      assert.equal((await call('/fonts/Inter-Variable.ttf')).status,200); assert.equal((await call('/brand/fambit-mark.png')).status,200);
      const basic = 'Basic '+Buffer.from('admin:'+password).toString('base64');
      assert.equal((await call('/api/licenses',{headers:{Authorization:basic}})).status,401);
    });
    await t.test('inicia sesión con segundo factor y bloquea escrituras de otro origen', async () => {
      const input = {user:'admin',password,code:totp(secret)};
      assert.equal((await call('/admin/login',{method:'POST',headers:{Origin:'https://other.test','Content-Type':'application/json'},body:JSON.stringify(input)})).status,403);
      const result = await call('/admin/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(input)});
      assert.equal(result.status,200); cookie=cookieHeader(result.headers.get('set-cookie'));
      const view=await call('/admin',{headers:{Cookie:cookie}}); assert.equal(view.status,200);
      assert.match(view.headers.get('content-security-policy'), /frame-ancestors 'none'/);
      assert.equal((await call('/api/licenses',{method:'POST',headers:{Cookie:cookie,Origin:'https://other.test','Content-Type':'application/json'},body:'{}'})).status,403);
      assert.equal((await call('/api/licenses',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:'{}'})).status,403);
    });
    await t.test('crea y activa una licencia sin dar acceso administrativo al cliente', async () => {
      const created = await admin('/api/licenses','POST',{name:'Cliente de prueba',email:'test@example.test',maxDevices:1,expires:Math.floor(Date.now()/1000)+86400});
      assert.equal(created.status,201); ({id:licenseId,key}=await created.json());
      const activation = await call('/api/client/activate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'test@example.test',key,deviceId:'fixture-device',deviceName:'Fixture'})});
      assert.equal(activation.status,200); token=(await activation.json()).token;
      assert.equal((await client('/api/client/session')).status,200);
      assert.equal((await client('/api/licenses')).status,401);
    });
    await t.test('descarga autorizada y suspensión comprobadas a través de HTTP', async () => {
      const form = new FormData(); const bytes=Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1,...Array(80).fill(0)]);
      form.set('name','Fixture sintético, no es una familia Revit'); form.set('category','arquitectura'); form.set('subcategory','sillas'); form.set('revit','2025'); form.set('file',new File([bytes],'fixture.rfa'));
      const uploaded = await call('/api/families',{method:'POST',headers:{Cookie:cookie,Origin:origin},body:form}); assert.equal(uploaded.status,201); familyId=(await uploaded.json()).id;
      const download=await client('/api/client/families/'+familyId+'/file?revit=2025'); assert.equal(download.status,200); assert.equal(download.headers.get('x-content-sha256'),hash(bytes)); assert.deepEqual(Buffer.from(await download.arrayBuffer()),bytes);
      assert.equal((await admin('/api/licenses/'+licenseId,'PATCH',{status:'suspended'})).status,200);
      assert.equal((await client('/api/client/families/'+familyId+'/file?revit=2025')).status,403);
      assert.equal((await admin('/api/licenses/'+licenseId,'PATCH',{status:'active'})).status,200);
    });
    await t.test('limita intentos y mantiene las licencias separadas de la sesión administrativa', async () => {
      const statuses=[];
      for(let i=0;i<7;i++) statuses.push((await call('/admin/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Accept:'application/json','X-Forwarded-For':'203.0.113.50'},body:JSON.stringify({user:'admin',password:'incorrect'})})).status);
      assert.deepEqual(statuses,[401,401,401,401,401,401,429]);
      assert.equal((await admin('/api/licenses')).status,200);
      assert.equal((await call('/admin/logout',{method:'POST',headers:{Cookie:cookie,Origin:origin}})).status,303);
      assert.equal((await admin('/api/licenses')).status,401);
      assert.equal((await client('/api/client/session')).status,200);
    });
    await t.test('rehúsa copiar un servidor activo y restaura IDs, dueño, archivos y tokens', async () => {
      await assert.rejects(createBackup(data,join(root,'running-copy')),/Detén el servidor/);
      await app.close(); app=null;
      const maintenance = await startMaintenance({...env,FAMBIT_BACKUP_DIR:join(root,'maintenance-backups')});
      maintenance.server.listen(0,'127.0.0.1'); await once(maintenance.server,'listening');
      try {
        const maintenanceUrl='http://127.0.0.1:'+maintenance.server.address().port;
        assert.deepEqual(await (await fetch(maintenanceUrl+'/healthz')).json(),{status:'maintenance'});
        assert.equal((await fetch(maintenanceUrl+'/api/client/session',{headers:{Authorization:'Bearer '+token}})).status,503);
        assert.equal((await restoreBackup(maintenance.backup.directory,join(root,'maintenance-restored'))).files>0,true);
      } finally { await new Promise(resolve=>maintenance.server.close(resolve)); }
      const backup=join(root,'backup'), restored=join(root,'restored');
      await createBackup(data,backup);
      const result=await restoreBackup(backup,restored); assert.deepEqual(result.owners,['local-test']);
      const sql=new DatabaseSync(join(restored,'nube.sqlite'),{readOnly:true});
      try { assert.equal(sql.prepare('SELECT id FROM licenses').get().id,licenseId); assert.equal(sql.prepare('SELECT id FROM families').get().id,familyId); }
      finally { sql.close(); }
      await assert.rejects(restoreBackup(backup,restored),{code:'EEXIST'});
      env.NUBE_DATA_DIR=restored; await start();
      assert.equal((await client('/api/client/session')).status,200);
      assert.equal((await client('/api/client/families/'+familyId+'/file?revit=2025')).status,200);
      assert.equal((await admin('/api/licenses')).status,401);
      await app.close(); app=null;
      const manifest=JSON.parse(await readFile(join(backup,'backup.json'),'utf8'));
      const object=manifest.files.find(file=>file.name.startsWith('objects/')&&!file.name.endsWith('.json'));
      await writeFile(join(backup,object.name),'corruption');
      await assert.rejects(restoreBackup(backup,join(root,'corrupt')),/incompleta o ha cambiado/);
    });
  } finally { if(app)await app.close(); await rm(root,{recursive:true,force:true}); }
});

test('conserva el modo local y genera configuración privada sin sobreescribir', async () => {
  const root = await mkdtemp(join(tmpdir(),'fambit-setup-')); let app;
  try {
    const directory = join(root,'credentials'); await provision(directory);
    const config = await readFile(join(directory,'servidor.env'),'utf8');
    assert.match(config,/NUBE_ADMIN_PASSWORD=[A-Za-z0-9_-]{32}/); assert.match(config,/FAMBIT_ADMIN_TOTP_SECRET=[A-Z2-7]{32}/);
    await assert.rejects(provision(directory),{code:'EEXIST'});
    app=await createFambitServer({PORT:'0',NUBE_PUBLIC_ORIGIN:'http://127.0.0.1:8787',NUBE_ADMIN_PASSWORD:password,NUBE_DATA_DIR:join(root,'local')});
    app.server.listen(0,'127.0.0.1'); await once(app.server,'listening');
    const origin='http://127.0.0.1:'+app.server.address().port;
    const home=await fetch(origin,{redirect:'manual'}); assert.equal(home.status,303); assert.equal(home.headers.get('location'),'/admin');
    const login=await fetch(origin+'/admin/login'); assert.ok(!(await login.text()).includes('name="code"'));
    const response=await fetch(origin+'/admin/login',{method:'POST',redirect:'manual',headers:{Origin:'http://127.0.0.1:8787','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({user:'admin',password})});
    assert.equal(response.status,303); assert.match(response.headers.get('set-cookie'),/^fambit_admin_local=/); assert.ok(!response.headers.get('set-cookie').includes('; Secure'));
  } finally { if(app)await app.close(); await rm(root,{recursive:true,force:true}); }
});

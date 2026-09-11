import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const dir=await mkdtemp(join(tmpdir(),'nube-http-'));const secret=randomBytes(32).toString('hex');const base='http://127.0.0.1:19387';
const child=spawn(process.execPath,['selfhost/server.mjs'],{cwd:fileURLToPath(new URL('..',import.meta.url)),env:{...process.env,PORT:'19387',NUBE_PUBLIC_ORIGIN:base,NUBE_DATA_DIR:dir,NUBE_ADMIN_PASSWORD:secret},stdio:['ignore','pipe','pipe']});
try{
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Servidor sin respuesta')),10000);child.stdout.once('data',()=>{clearTimeout(timeout);resolve();});child.once('exit',()=>reject(new Error('Servidor no iniciado')));});
 assert.equal((await fetch(base)).status,401);
 const auth='Basic '+Buffer.from('admin:'+secret).toString('base64');
 const index=await fetch(base,{headers:{Authorization:auth}});assert.equal(index.status,200);const html=await index.text();assert.match(html,/FAMBIT/);
 const source=html.match(/src="([^"]+\.js)"/)[1];assert.equal((await fetch(base+source,{headers:{Authorization:auth}})).status,200);
 const font=await fetch(base+'/fonts/Inter-Variable.ttf',{headers:{Authorization:auth}});assert.equal(font.status,200);assert.ok((await font.arrayBuffer()).byteLength>100000);
 const response=await fetch(base+'/api/licenses',{method:'POST',headers:{Authorization:auth,Origin:base,'Content-Type':'application/json'},body:JSON.stringify({name:'Smoke test',email:'smoke@example.test',expires:Math.floor(Date.now()/1000)+86400,maxDevices:1})});assert.equal(response.status,201);const {key}=await response.json();
 const client=await fetch(base+'/api/client/activate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'smoke@example.test',key,deviceId:'http-test',deviceName:'HTTP test'})});assert.equal(client.status,200);
 const {token}=await client.json();assert.equal((await fetch(base+'/api/client/families?revit=2024',{headers:{Authorization:'Bearer '+token}})).status,200);
 assert.equal((await fetch(base+'/api/licenses',{headers:{Authorization:'Bearer '+token}})).status,401);
 const mark=await fetch(base+'/brand/fambit-mark.png',{headers:{Authorization:auth}});assert.equal(mark.status,200);assert.equal(mark.headers.get('Content-Type'),'image/png');assert.ok((await mark.arrayBuffer()).byteLength>1000);
 console.log('HTTP OK: administración protegida, portal servido, cuenta creada, activación y acceso del cliente sin privilegios administrativos.');
}finally{child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));await rm(dir,{recursive:true,force:true});}

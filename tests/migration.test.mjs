import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openBindings} from '../selfhost/adapters.mjs';
import {serve,digest} from '../selfhost/service.mjs';

test('actualiza una base 0.1.2 con familias y licencia NUBE sin perder datos ni repetir migraciones',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'fambit-upgrade-'));
 const oldMigrations=join(folder,'old-migrations'),data=join(folder,'data');
 const migrations=fileURLToPath(new URL('../drizzle',import.meta.url));
 await mkdir(oldMigrations);
 await copyFile(join(migrations,'0000_fat_shiver_man.sql'),join(oldMigrations,'0000_fat_shiver_man.sql'));
 let bindings;
 try{
  bindings=await openBindings(data,oldMigrations);
  const key='NUBE-'+'A'.repeat(40),token='b'.repeat(64),expires=Math.floor(Date.now()/1000)+86400;
  await bindings.DB.prepare("INSERT INTO licenses(id,owner,name,email,key_hash,key_suffix,status,expires,max_devices,created) VALUES('old-license','local-test','Anterior','previous@example.test',?,'AAAAAA','active',?,2,1)").bind(await digest(key),expires).run();
  await bindings.DB.prepare("INSERT INTO devices(id,license_id,device_id,name,token_hash,token_expires,last_seen) VALUES('old-device','old-license','previous-pc','Equipo anterior',?,?,1)").bind(await digest(token),expires).run();
  for(const [id,category] of [['chair','mobiliario'],['window','puertas-ventanas'],['lamp','electricas']]){
   await bindings.DB.prepare('INSERT INTO families(id,owner,name,category,revit,revision,object_key,size,sha256,updated) VALUES(?,?,?,?,2024,3,?,4,?,1)').bind(id,'local-test',id,category,id,await digest(new Uint8Array([1,2,3,4]).buffer)).run();
   await bindings.BUCKET.put(id,new Uint8Array([1,2,3,4]),{httpMetadata:{contentType:'application/octet-stream'}});
  }
  const before=(await bindings.DB.prepare('SELECT * FROM families ORDER BY id').all()).results;
  const devices=(await bindings.DB.prepare('SELECT * FROM devices').all()).results;
  const licenses=(await bindings.DB.prepare('SELECT * FROM licenses').all()).results;
  bindings.close();bindings=null;
  bindings=await openBindings(data,migrations);
  const upgraded=(await bindings.DB.prepare('SELECT * FROM families ORDER BY id').all()).results;
  const expected={chair:['arquitectura','muebles'],window:['arquitectura','puertas-ventanas'],lamp:['electricas','otros']};
  for(let i=0;i<upgraded.length;i++){
   const {category,subcategory,...rest}=upgraded[i];const {category:oldCategory,...original}=before[i];
   assert.deepEqual(rest,original);assert.deepEqual([category,subcategory],expected[rest.id]);
   const object=await bindings.BUCKET.get(rest.object_key);assert.deepEqual(new Uint8Array(await new Response(object.body).arrayBuffer()),new Uint8Array([1,2,3,4]));
  }
  assert.deepEqual((await bindings.DB.prepare('SELECT * FROM devices').all()).results,devices);
  assert.deepEqual((await bindings.DB.prepare('SELECT * FROM licenses').all()).results,licenses);
  const session=await serve(new Request('https://fambit.test/api/client/session',{headers:{Authorization:'Bearer '+token}}),bindings,null);assert.equal(session.status,200);
  const activation=await serve(new Request('https://fambit.test/api/client/activate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'previous@example.test',key,deviceId:'previous-pc',deviceName:'Equipo anterior'})}),bindings,null);assert.equal(activation.status,200);
  bindings.close();bindings=null;bindings=await openBindings(data,migrations);
  assert.deepEqual((await bindings.DB.prepare('SELECT * FROM families ORDER BY id').all()).results,upgraded);
  assert.equal((await bindings.DB.prepare('SELECT COUNT(*) AS n FROM _nube_migrations').first()).n,2);
 }finally{bindings?.close();await rm(folder,{recursive:true,force:true});}
});

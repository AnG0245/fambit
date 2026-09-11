import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openBindings} from '../selfhost/adapters.mjs';
import {serve,digest} from '../selfhost/service.mjs';
const origin='https://nube.test';
const seconds=()=>Math.floor(Date.now()/1000);
test('licencias, permisos, aislamiento, archivos y publicación',async t=>{
 const folder=await mkdtemp(join(tmpdir(),'nube-test-'));const e=await openBindings(folder,new URL('../drizzle',import.meta.url).pathname);
 async function call(path,{method='GET',data,form,token,owner='owner-a',requestOrigin=origin}={}){
  const headers=new Headers();if(requestOrigin)headers.set('Origin',requestOrigin);if(token)headers.set('Authorization','Bearer '+token);if(data)headers.set('Content-Type','application/json');
  const req=new Request(origin+'/api'+path,{method,headers,body:form??(data?JSON.stringify(data):undefined)});const res=await serve(req,e,owner);return {status:res.status,data:()=>res.json(),response:res};
 }
 let id,key,token,fileId;
 try{
  await t.test('rechaza visitantes sin identidad y solicitudes de otro origen',async()=>{assert.equal((await call('/licenses',{owner:null})).status,401);assert.equal((await call('/licenses',{method:'POST',data:{},requestOrigin:'https://other.test'})).status,403);});
  await t.test('crea cuenta, almacena solo hash y rechaza correo duplicado',async()=>{const data={name:'Cuenta de prueba',email:'test@example.test',expires:seconds()+86400,maxDevices:1};const r=await call('/licenses',{method:'POST',data});assert.equal(r.status,201);({id,key}=await r.data());assert.match(key,/^FAMBIT-[A-F0-9]{40}$/);const row=await e.DB.prepare('SELECT key_hash FROM licenses WHERE id=?').bind(id).first();assert.equal(row.key_hash,await digest(key));const view=JSON.stringify(await (await call('/licenses')).data());assert.ok(!view.includes(key));assert.equal((await call('/licenses',{method:'POST',data})).status,409);});
  await t.test('aislamiento entre administradores',async()=>{const b=await (await call('/licenses',{owner:'owner-b'})).data();assert.equal(b.licenses.length,0);assert.equal((await call('/licenses/'+id,{owner:'owner-b',method:'PATCH',data:{status:'suspended'}})).status,404);});
  await t.test('activación inválida y límite atómico de equipos',async()=>{assert.equal((await call('/client/activate',{owner:null,method:'POST',data:{email:'test@example.test',key:'INVALID',deviceId:'bad',deviceName:'bad'}})).status,403);
   const activations=await Promise.all(['a','b'].map(deviceId=>call('/client/activate',{owner:null,method:'POST',data:{email:'test@example.test',key,deviceId,deviceName:deviceId}})));assert.deepEqual(activations.map(r=>r.status).sort(),[200,409]);token=(await activations.find(r=>r.status===200).data()).token;assert.equal((await call('/client/session',{owner:null,token})).status,200);
  });
  await t.test('suspensión bloquea un token existente y la reactivación lo rehabilita',async()=>{await call('/licenses/'+id,{method:'PATCH',data:{status:'suspended'}});assert.equal((await call('/client/families?revit=2025',{owner:null,token})).status,403);await call('/licenses/'+id,{method:'PATCH',data:{status:'active'}});assert.equal((await call('/client/session',{owner:null,token})).status,200);});
  await t.test('vencimiento comprobado en el servidor',async()=>{await e.DB.prepare('UPDATE licenses SET expires=? WHERE id=?').bind(seconds()-1,id).run();assert.equal((await call('/client/session',{owner:null,token})).status,403);await e.DB.prepare('UPDATE licenses SET expires=? WHERE id=?').bind(seconds()+86400,id).run();});
  function form(fake=false,id){const f=new FormData();f.set('name','Fixture sintético, NO es una familia Revit');f.set('category','mobiliario');f.set('revit','2025');if(id)f.set('id',id);const fixture=fake?new Uint8Array(32):new Uint8Array([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1,...Array(80).fill(0)]);f.set('file',new File([fixture],'fixture.rfa'));return f;}
  await t.test('verifica contenedor básico y guarda metadatos de versión',async()=>{assert.equal((await call('/families',{method:'POST',form:form(true)})).status,400);const r=await call('/families',{method:'POST',form:form()});assert.equal(r.status,201);fileId=(await r.data()).id;const all=await (await call('/client/families?revit=2024',{owner:null,token})).data();assert.equal(all.families.length,0);assert.equal((await (await call('/client/families?revit=2025',{owner:null,token})).data()).families.length,1);});
  await t.test('descarga con autorización, versión y hash; oculta al cliente',async()=>{assert.equal((await call('/client/families/'+fileId+'/file?revit=2024',{owner:null,token})).status,409);assert.equal((await call('/families/'+fileId+'/file',{owner:'owner-b'})).status,404);const r=await call('/client/families/'+fileId+'/file?revit=2025',{owner:null,token});assert.equal(r.status,200);const data=await r.response.arrayBuffer();assert.equal(r.response.headers.get('X-Content-SHA256'),await digest(data));await call('/families/'+fileId,{method:'PATCH',data:{published:false}});assert.equal((await call('/client/families/'+fileId+'/file?revit=2025',{owner:null,token})).status,404);await call('/families/'+fileId,{method:'PATCH',data:{published:true}});});
  await t.test('actualiza el archivo con la misma identidad y revisión nueva',async()=>{assert.equal((await call('/families',{method:'POST',form:form(false,fileId)})).status,201);const items=(await (await call('/families')).data()).families;assert.equal(items.length,1);assert.equal(items[0].id,fileId);assert.equal(items[0].revision,2);});
  await t.test('expone jerarquía autenticada y normaliza categorías anteriores',async()=>{
   assert.equal((await call('/categories',{owner:null})).status,401);
   assert.equal((await call('/client/categories',{owner:null})).status,401);
   const {categories}=await (await call('/client/categories',{owner:null,token})).data();
   assert.equal(categories.length,5);assert.ok(categories.every(c=>c.subcategories.length>1));
   const architecture=categories.find(c=>c.id==='arquitectura');
   for(const sub of ['puertas','ventanas','muebles','sillas','mesas'])assert.ok(architecture.subcategories.some(s=>s.id===sub));
   const item=(await (await call('/families')).data()).families[0];
   assert.equal(item.category,'arquitectura');assert.equal(item.subcategory,'muebles');assert.equal(item.hasThumbnail,false);
   const invalid=form(false,fileId);invalid.set('category','electricas');invalid.set('subcategory','sillas');
   assert.equal((await call('/families',{method:'POST',form:invalid})).status,400);
  });
  await t.test('edita miniatura y clasificación sin reemplazar ni alterar el RFA',async()=>{
   const previous=await e.DB.prepare('SELECT * FROM families WHERE id=?').bind(fileId).first();
   const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1X8AAAAASUVORK5CYII=','base64');
   const data=form(false,fileId);data.delete('file');data.set('name','Silla de prueba');data.set('category','arquitectura');data.set('subcategory','sillas');data.set('thumbnail',new File([png],'silla.png',{type:'image/png'}));
   assert.equal((await call('/families',{method:'POST',form:data,owner:'owner-b'})).status,404);
   assert.equal((await call('/families',{method:'POST',form:data})).status,201);
   const updated=await e.DB.prepare('SELECT * FROM families WHERE id=?').bind(fileId).first();
   for(const field of ['id','object_key','sha256','size','revision','published'])assert.equal(updated[field],previous[field],field);
   assert.equal(updated.subcategory,'sillas');assert.equal(updated.name,'Silla de prueba');
   const item=(await (await call('/client/families?revit=2025',{owner:null,token})).data()).families[0];assert.equal(item.hasThumbnail,true);
   const preview=await call('/client/families/'+fileId+'/thumbnail?revit=2025',{owner:null,token});assert.equal(preview.status,200);assert.equal(preview.response.headers.get('Content-Type'),'image/png');assert.deepEqual(Buffer.from(await preview.response.arrayBuffer()),png);
   await call('/licenses/'+id,{method:'PATCH',data:{status:'suspended'}});
   assert.equal((await call('/client/families/'+fileId+'/thumbnail?revit=2025',{owner:null,token})).status,403);
   assert.equal((await call('/client/categories',{owner:null,token})).status,403);
   await call('/licenses/'+id,{method:'PATCH',data:{status:'active'}});
   const missing=form();missing.delete('file');assert.equal((await call('/families',{method:'POST',form:missing})).status,400);
  });
  await t.test('liberar equipo invalida su sesión y permite nueva activación',async()=>{const d=(await (await call('/licenses')).data()).devices[0];await call('/devices/'+d.id,{method:'DELETE'});assert.equal((await call('/client/session',{owner:null,token})).status,401);const a=await call('/client/activate',{owner:null,method:'POST',data:{email:'test@example.test',key,deviceId:'new',deviceName:'Nuevo'}});assert.equal(a.status,200);token=(await a.data()).token;});
  await t.test('rotación invalida todas las sesiones y la clave anterior',async()=>{const r=await call('/licenses/'+id,{method:'PATCH',data:{rotateKey:true}});assert.equal(r.status,200);assert.notEqual((await r.data()).key,key);assert.equal((await call('/client/session',{owner:null,token})).status,401);assert.equal((await call('/client/activate',{owner:null,method:'POST',data:{email:'test@example.test',key,deviceId:'a',deviceName:'a'}})).status,403);});
  await t.test('registra versiones solo con URL HTTPS y SHA válido',async()=>{const data={version:'1.0.0',url:'http://invalid.test/setup.exe',sha256:'a'.repeat(64),notes:'Prueba'};assert.equal((await call('/releases',{method:'POST',data})).status,400);data.url='https://download.example.test/setup.exe';assert.equal((await call('/releases',{method:'POST',data})).status,201);assert.equal((await (await call('/releases')).data()).releases.length,1);});
 }finally{e.close();await rm(folder,{recursive:true,force:true});}
});

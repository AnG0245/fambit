import {categories,classification} from "./catalog";
export interface Bindings {DB:D1Database;BUCKET:R2Bucket}
export class ApiError extends Error{constructor(public status:number,message:string){super(message);}}
const now=()=>Math.floor(Date.now()/1000);
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{"Cache-Control":"no-store"}});
export async function digest(value:string|ArrayBuffer){const b=typeof value==="string"?new TextEncoder().encode(value):value;return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",b))).map(v=>v.toString(16).padStart(2,"0")).join("");}
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32))).map(v=>v.toString(16).padStart(2,"0")).join("");
function str(v:unknown,max=200){if(typeof v!=="string"||!v.trim()||v.length>max)throw new ApiError(400,"Revisa los campos obligatorios.");return v.trim();}
function integer(v:unknown,min:number,max:number){const n=Number(v);if(!Number.isInteger(n)||n<min||n>max)throw new ApiError(400,"Valor numérico fuera del rango permitido.");return n;}
async function body(req:Request){try{return await req.json() as Record<string,unknown>;}catch{throw new ApiError(400,"Solicitud inválida.");}}
export async function clientIdentity(req:Request,e:Bindings){
 const token=req.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];if(!token)throw new ApiError(401,"Activa tu licencia para continuar.");
 const row=await e.DB.prepare(`SELECT l.owner,l.id AS license_id,l.status,l.expires,d.id AS device_row FROM devices d JOIN licenses l ON l.id=d.license_id WHERE d.token_hash=? AND d.token_expires>?`).bind(await digest(token),now()).first<{owner:string;license_id:string;status:string;expires:number;device_row:string}>();
 if(!row)throw new ApiError(401,"La sesión expiró. Activa tu licencia de nuevo.");if(row.status!=="active"||row.expires<=now())throw new ApiError(403,"Tu licencia está suspendida o vencida.");
 await e.DB.prepare("UPDATE devices SET last_seen=? WHERE id=?").bind(now(),row.device_row).run();return row;
}
export async function serve(req:Request,e:Bindings,adminOwner:string|null):Promise<Response>{
 try{
  if(!e.DB||!e.BUCKET)throw new ApiError(503,"El repositorio no está disponible. Intenta de nuevo en unos minutos.");
  const url=new URL(req.url),path=url.pathname.replace(/^\/api/,""),method=req.method;
  if(path==="/client/activate"&&method==="POST"){
   const b=await body(req),email=str(b.email,254).toLowerCase(),key=str(b.key,100).toUpperCase(),device=str(b.deviceId,100),deviceName=str(b.deviceName,100);
   const l=await e.DB.prepare("SELECT * FROM licenses WHERE key_hash=? AND email=?").bind(await digest(key),email).first<any>();
   if(!l||l.status!=="active"||l.expires<=now())throw new ApiError(403,"Correo o licencia no válidos, suspendidos o vencidos.");
   // One conditional statement serializes seat allocation, even under concurrent activation.
   await e.DB.prepare(`INSERT INTO devices(id,license_id,device_id,name,token_expires,last_seen) SELECT ?,?,?,?,?,? WHERE (SELECT count(*) FROM devices WHERE license_id=?) < ? ON CONFLICT(license_id,device_id) DO NOTHING`).bind(crypto.randomUUID(),l.id,device,deviceName,0,now(),l.id,l.max_devices).run();
   const d=await e.DB.prepare("SELECT id FROM devices WHERE license_id=? AND device_id=?").bind(l.id,device).first<{id:string}>();if(!d)throw new ApiError(409,"Esta licencia alcanzó su límite de equipos. Solicita liberar uno.");
   const token=random(),expires=Math.min(l.expires,now()+30*86400);
   await e.DB.prepare("UPDATE devices SET token_hash=?,token_expires=?,last_seen=?,name=? WHERE id=?").bind(await digest(token),expires,now(),deviceName,d.id).run();return json({token,expires,licenseExpires:l.expires,name:l.name});
  }
  const isClient=path.startsWith("/client/"),client=isClient?await clientIdentity(req,e):null,owner=client?.owner??adminOwner;
  if(!owner)throw new ApiError(401,"Inicia sesión para acceder al repositorio.");
  if(!isClient&&method!=="GET"&&req.headers.get("origin")!==url.origin)throw new ApiError(403,"Origen de la solicitud no permitido.");
  if(path==="/client/session"&&method==="GET")return json({active:true,expires:client!.expires});
  if(path==="/client/session"&&method==="DELETE"){await e.DB.prepare("DELETE FROM devices WHERE id=? AND license_id=?").bind(client!.device_row,client!.license_id).run();return json({ok:true});}
  if((path==="/categories"||path==="/client/categories")&&method==="GET")return json({categories});
  if((path==="/families"||path==="/client/families")&&method==="GET"){
   const year=url.searchParams.has("revit")?integer(url.searchParams.get("revit"),2024,2027):2027;
   const r=await e.DB.prepare(`SELECT id,name,category,subcategory,description,revit,revision,size,sha256,published,updated,thumbnail_key IS NOT NULL AS hasThumbnail FROM families WHERE owner=? ${isClient?"AND published=1 AND revit<=?":""} ORDER BY updated DESC`).bind(...(isClient?[owner,year]:[owner])).all();return json({families:r.results.map((f:any)=>({...f,hasThumbnail:!!f.hasThumbnail}))});
  }
  const file=path.match(/^\/(?:client\/)?families\/([a-zA-Z0-9-]+)\/(file|thumbnail)$/);
  if(file&&method==="GET"){
   const f=await e.DB.prepare("SELECT * FROM families WHERE id=? AND owner=?").bind(file[1],owner).first<any>();if(!f||(isClient&&!f.published))throw new ApiError(404,"Familia no disponible.");
   if(isClient&&f.revit>integer(url.searchParams.get("revit"),2024,2027))throw new ApiError(409,"La familia requiere una versión posterior de Revit.");
   const key=file[2]==="file"?f.object_key:f.thumbnail_key;if(!key)throw new ApiError(404,"Vista previa no disponible.");
   const obj=await e.BUCKET.get(key);if(!obj)throw new ApiError(404,"Archivo no disponible.");
   const h=new Headers({"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"});h.set("Content-Type",file[2]==="file"?"application/octet-stream":obj.httpMetadata?.contentType??"image/png");
   if(file[2]==="file"){h.set("Content-Disposition",`attachment; filename="${f.id}.rfa"`);h.set("X-Content-SHA256",f.sha256);}return new Response(obj.body,{headers:h});
  }
  if(path==="/families"&&method==="POST"){
   if(Number(req.headers.get("content-length"))>29*1024*1024)throw new ApiError(413,"Usa archivos RFA de hasta 25 MB.");
   const form=await req.formData(),name=str(form.get("name")),revit=integer(form.get("revit"),2024,2027),description=String(form.get("description")??"").slice(0,1500);
   const {category,subcategory}=classification(str(form.get("category")),String(form.get("subcategory")??""));
   const group=categories.find(c=>c.id===category);
   if(!group||!group.subcategories.some(c=>c.id===subcategory))throw new ApiError(400,"Selecciona una categoría y una subcategoría válidas.");
   const existingId=form.get("id"),old=existingId?await e.DB.prepare("SELECT * FROM families WHERE id=? AND owner=?").bind(str(existingId),owner).first<any>():null;
   if(existingId&&!old)throw new ApiError(404,"La familia que quieres actualizar no existe.");
   const f=form.get("file"),hasFile=f instanceof File&&f.size>0;
   if(!hasFile&&!old)throw new ApiError(400,"Adjunta un archivo .rfa de hasta 25 MB.");
   let bytes:ArrayBuffer|null=null;
   if(hasFile){
    if(!f.name.toLowerCase().endsWith(".rfa")||f.size>25*1024*1024||f.size<8)throw new ApiError(400,"Adjunta un archivo .rfa de hasta 25 MB.");
    bytes=await f.arrayBuffer();const magic=Array.from(new Uint8Array(bytes,0,8)).map(x=>x.toString(16).padStart(2,"0")).join("");
    if(magic!=="d0cf11e0a1b11ae1")throw new ApiError(400,"El archivo no tiene el contenedor esperado de una familia Revit.");
   }
   const id=old?.id??crypto.randomUUID(),key=bytes?`${owner}/${id}/${crypto.randomUUID()}.rfa`:old.object_key,hash=bytes?await digest(bytes):old.sha256;
   let thumbKey=old?.thumbnail_key??null,newThumb:string|null=null;
   const thumb=form.get("thumbnail");if(thumb instanceof File&&thumb.size){
    if(thumb.size>2*1024*1024)throw new ApiError(400,"La miniatura debe pesar hasta 2 MB.");const data=await thumb.arrayBuffer(),s=new Uint8Array(data),png=s[0]===137&&s[1]===80&&s[2]===78&&s[3]===71,jpg=s[0]===255&&s[1]===216&&s[2]===255;
    if(!png&&!jpg)throw new ApiError(400,"Usa una miniatura PNG o JPG válida.");newThumb=`${owner}/${id}/${crypto.randomUUID()}.${png?"png":"jpg"}`;await e.BUCKET.put(newThumb,data,{httpMetadata:{contentType:png?"image/png":"image/jpeg"}});thumbKey=newThumb;
   }
   try{
    if(bytes)await e.BUCKET.put(key,bytes,{httpMetadata:{contentType:"application/octet-stream"}});
    if(old)await e.DB.prepare("UPDATE families SET name=?,category=?,subcategory=?,description=?,revit=?,revision=revision+?,object_key=?,thumbnail_key=?,size=?,sha256=?,updated=? WHERE id=? AND owner=?").bind(name,category,subcategory,description,revit,hasFile?1:0,key,thumbKey,hasFile?f.size:old.size,hash,now(),id,owner).run();
    else await e.DB.prepare("INSERT INTO families(id,owner,name,category,subcategory,description,revit,revision,object_key,thumbnail_key,size,sha256,published,updated) VALUES(?,?,?,?,?,?,?,1,?,?,?,?,1,?)").bind(id,owner,name,category,subcategory,description,revit,key,thumbKey,hasFile?f.size:old.size,hash,now()).run();
   }catch(err){if(bytes)await e.BUCKET.delete(key);if(newThumb)await e.BUCKET.delete(newThumb);throw err;}
   return json({id},201);
  }
  const family=path.match(/^\/families\/([a-zA-Z0-9-]+)$/);if(family&&method==="PATCH"){
   const b=await body(req);if(typeof b.published!=="boolean")throw new ApiError(400,"Estado inválido.");const r=await e.DB.prepare("UPDATE families SET published=?,updated=? WHERE id=? AND owner=?").bind(b.published?1:0,now(),family[1],owner).run();if(!r.meta.changes)throw new ApiError(404,"Familia no encontrada.");return json({ok:true});
  }
  if(path==="/licenses"&&method==="GET"){
   const l=await e.DB.prepare("SELECT l.id,l.name,l.email,l.key_suffix,l.status,l.expires,l.max_devices,l.created,(SELECT count(*) FROM devices d WHERE d.license_id=l.id) AS device_count FROM licenses l WHERE l.owner=? ORDER BY l.created DESC").bind(owner).all();const d=await e.DB.prepare("SELECT d.id,d.license_id,d.name,d.last_seen FROM devices d JOIN licenses l ON l.id=d.license_id WHERE l.owner=?").bind(owner).all();return json({licenses:l.results,devices:d.results});
  }
  if(path==="/licenses"&&method==="POST"){
   const b=await body(req),name=str(b.name),email=str(b.email,254).toLowerCase(),expires=integer(b.expires,now()+60,4102444800),max=integer(b.maxDevices,1,100);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new ApiError(400,"Introduce un correo válido.");
   if(await e.DB.prepare("SELECT id FROM licenses WHERE owner=? AND email=?").bind(owner,email).first())throw new ApiError(409,"Esta cuenta ya existe. Puedes renovar su licencia.");
   const key="FAMBIT-"+random().slice(0,40).toUpperCase(),id=crypto.randomUUID();await e.DB.prepare("INSERT INTO licenses(id,owner,name,email,key_hash,key_suffix,status,expires,max_devices,created) VALUES(?,?,?,?,?,?,'active',?,?,?)").bind(id,owner,name,email,await digest(key),key.slice(-6),expires,max,now()).run();return json({id,key},201);
  }
  const license=path.match(/^\/licenses\/([a-zA-Z0-9-]+)$/);if(license&&method==="PATCH"){
   const b=await body(req),l=await e.DB.prepare("SELECT * FROM licenses WHERE id=? AND owner=?").bind(license[1],owner).first<any>();if(!l)throw new ApiError(404,"Cuenta no encontrada.");const status=b.status===undefined?l.status:str(b.status);if(!["active","suspended"].includes(status))throw new ApiError(400,"Estado inválido.");
   const expires=b.expires===undefined?l.expires:integer(b.expires,now()+60,4102444800),max=b.maxDevices===undefined?l.max_devices:integer(b.maxDevices,1,100),seats=await e.DB.prepare("SELECT count(*) AS n FROM devices WHERE license_id=?").bind(l.id).first<{n:number}>();if(max<(seats?.n??0))throw new ApiError(409,"Libera equipos antes de reducir el límite.");
   const key=b.rotateKey===true?"FAMBIT-"+random().slice(0,40).toUpperCase():null;
   await e.DB.batch([e.DB.prepare("UPDATE licenses SET status=?,expires=?,max_devices=?,key_hash=?,key_suffix=? WHERE id=? AND owner=?").bind(status,expires,max,key?await digest(key):l.key_hash,key?key.slice(-6):l.key_suffix,l.id,owner),...(key?[e.DB.prepare("DELETE FROM devices WHERE license_id=?").bind(l.id)]:[])]);return json({ok:true,...(key?{key}:{})});
  }
  const device=path.match(/^\/devices\/([a-zA-Z0-9-]+)$/);if(device&&method==="DELETE"){const r=await e.DB.prepare("DELETE FROM devices WHERE id=? AND license_id IN (SELECT id FROM licenses WHERE owner=?)").bind(device[1],owner).run();if(!r.meta.changes)throw new ApiError(404,"Equipo no encontrado.");return json({ok:true});}
  if((path==="/releases"||path==="/client/releases")&&method==="GET"){const r=await e.DB.prepare("SELECT id,version,url,sha256,notes,created FROM releases WHERE owner=? ORDER BY created DESC LIMIT 20").bind(owner).all();return json({releases:r.results});}
  if(path==="/releases"&&method==="POST"){
   const b=await body(req),version=str(b.version,30),address=str(b.url,2000),hash=str(b.sha256,64).toLowerCase(),notes=str(b.notes,2000);if(!/^\d+\.\d+\.\d+$/.test(version)||!/^https:\/\//i.test(address)||!/^[a-f0-9]{64}$/.test(hash))throw new ApiError(400,"Usa una versión 1.0.0, un enlace HTTPS y un SHA-256 válido.");
   try{const u=new URL(address);if(u.username||u.password||u.protocol!=="https:")throw 0;}catch{throw new ApiError(400,"El enlace no es válido.");}
   await e.DB.prepare("INSERT INTO releases(id,owner,version,url,sha256,notes,created) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(),owner,version,address,hash,notes,now()).run();return json({ok:true},201);
  }
  throw new ApiError(404,"Recurso no encontrado.");
 }catch(err){if(err instanceof ApiError)return json({error:err.message},err.status);console.error("Repository request failed",err instanceof Error?err.name:"unknown");return json({error:"No se pudo completar la operación. Intenta de nuevo."},503);}
}

import {DatabaseSync} from 'node:sqlite';
import {mkdir,readFile,writeFile,rename,unlink,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {Readable} from 'node:stream';
import {createHash,randomUUID} from 'node:crypto';
import {join} from 'node:path';
export async function openBindings(directory,migrationDirectory){
 await mkdir(directory,{recursive:true});const sql=new DatabaseSync(join(directory,'nube.sqlite'));sql.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
 sql.exec('CREATE TABLE IF NOT EXISTS _nube_migrations(name TEXT PRIMARY KEY, sha256 TEXT NOT NULL)');
 const {readdir}=await import('node:fs/promises');
 for(const name of (await readdir(migrationDirectory)).filter(n=>n.endsWith('.sql')).sort()){
  const source=await readFile(join(migrationDirectory,name),'utf8'),hash=createHash('sha256').update(source).digest('hex');const previous=sql.prepare('SELECT sha256 FROM _nube_migrations WHERE name=?').get(name);
  if(previous){if(previous.sha256!==hash)throw new Error('Migración aplicada modificada: '+name);continue;}
  sql.exec('BEGIN IMMEDIATE');try{sql.exec(source);sql.prepare('INSERT INTO _nube_migrations(name,sha256) VALUES(?,?)').run(name,hash);sql.exec('COMMIT');}catch(error){sql.exec('ROLLBACK');throw error;}
 }
 class Statement{
  constructor(query,args=[]){this.query=query;this.args=args;}
  bind(...args){return new Statement(this.query,args);}
  first(){return Promise.resolve(sql.prepare(this.query).get(...this.args)??null);}
  all(){return Promise.resolve({results:sql.prepare(this.query).all(...this.args),success:true});}
  sync(){const r=sql.prepare(this.query).run(...this.args);return {success:true,meta:{changes:Number(r.changes)}};}
  run(){return Promise.resolve(this.sync());}
 }
 const DB={prepare:query=>new Statement(query),batch:async statements=>{sql.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>s.sync());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};
 const folder=join(directory,'objects');await mkdir(folder,{recursive:true});const path=key=>join(folder,createHash('sha256').update(key).digest('hex'));
 const BUCKET={
  async put(key,data,options={}){const dest=path(key),temporary=dest+'.'+randomUUID()+'.tmp';await writeFile(temporary,Buffer.from(data));await rename(temporary,dest);await writeFile(dest+'.json',JSON.stringify(options));return {};},
  async get(key){const p=path(key);try{await stat(p);}catch(error){if(error.code==='ENOENT')return null;throw error;}const options=JSON.parse(await readFile(p+'.json','utf8'));return {body:Readable.toWeb(createReadStream(p)),httpMetadata:options.httpMetadata};},
  async delete(key){for(const p of [path(key),path(key)+'.json']){try{await unlink(p);}catch(error){if(error.code!=='ENOENT')throw error;}}}
 };
 return {DB,BUCKET,close:()=>sql.close()};
}

import {createClient} from '@libsql/client';
import {readdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const asMeta=result=>({meta:{changes:result.rowsAffected,last_row_id:Number(result.lastInsertRowid||0)}});
export async function createDatabase({url,authToken}){
 const client=createClient({url,authToken});
 try{
 await client.execute('PRAGMA foreign_keys=ON');
 await client.execute('CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied TEXT NOT NULL)');
 for(const name of (await readdir(new URL('../migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort()){
  const source=await readFile(new URL('../migrations/'+name,import.meta.url),'utf8'),checksum=createHash('sha256').update(source).digest('hex');
  const prior=await client.execute({sql:'SELECT checksum FROM schema_migrations WHERE name=?',args:[name]});
  if(prior.rows.length){if(prior.rows[0].checksum!==checksum)throw new Error('Migration checksum mismatch');continue}
  const statements=source.split('--> statement-breakpoint').map(sql=>sql.trim()).filter(Boolean);
  await client.batch([...statements,{sql:'INSERT INTO schema_migrations(name,checksum,applied) VALUES(?,?,?)',args:[name,checksum,new Date().toISOString()]}],'write');
 }
 return {prepare(sql){return {statement:{sql,args:[]},bind(...args){return {...this,statement:{sql,args}}},async first(){return (await client.execute(this.statement)).rows[0]||null},async all(){return {results:(await client.execute(this.statement)).rows}},async run(){return asMeta(await client.execute(this.statement))}}},async batch(statements){return (await client.batch(statements.map(s=>s.statement),'write')).map(asMeta)},close(){client.close()}};
 }catch(error){client.close();throw error}
}

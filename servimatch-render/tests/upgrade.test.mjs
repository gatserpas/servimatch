import test from 'node:test';import assert from 'node:assert/strict';import {createClient} from '@libsql/client';import {createHash} from 'node:crypto';import {readFile,mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {createDatabase} from '../lib/database.mjs';
test('application migration preserves existing professionals and data',async()=>{
 const work=await mkdtemp(path.join(tmpdir(),'sm-upgrade-')),url='file:'+path.join(work,'db.sqlite'),client=createClient({url});let db;
 try{
  await client.execute('CREATE TABLE schema_migrations(name TEXT PRIMARY KEY,checksum TEXT NOT NULL,applied TEXT NOT NULL)');
  for(const name of ['0000_futuristic_skaar.sql','0001_opposite_warbound.sql']){const sql=await readFile(new URL('../migrations/'+name,import.meta.url),'utf8');await client.batch([...sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean),{sql:'INSERT INTO schema_migrations VALUES(?,?,?)',args:[name,createHash('sha256').update(sql).digest('hex'),new Date().toISOString()]}],'write')}
  await client.batch([{sql:"INSERT INTO users(id,email,name,phone,role,created) VALUES('original','original@example.test','Profesional Original','70000000','worker','2026-10-21')"},{sql:"INSERT INTO professionals(user_id,service,price,bio,available) VALUES('original','Fontanería',2500,'Descripción original',1)"}],'write');client.close();
  db=await createDatabase({url});const professional=await db.prepare("SELECT * FROM professionals WHERE user_id='original'").first();assert.equal(professional.approval_status,'approved');assert.equal(professional.available,1);assert.equal(professional.price,2500);assert.equal(professional.bio,'Descripción original');assert.equal(professional.application_version,1);
 }finally{client.close();db?.close();await rm(work,{recursive:true,force:true})}
});

import test from 'node:test';import assert from 'node:assert/strict';import {createDatabase} from '../lib/database.mjs';import {createAppServer} from '../server.mjs';
test('Render proxy origin issues Secure cookies, rejects cross-origin writes and survives DB restart',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),path=await import('node:path');const work=await mkdtemp(path.join(tmpdir(),'sm-turso-'));const url='file:'+path.join(work,'db.sqlite');
 let DB=await createDatabase({url});const token='b'.repeat(64),server=createAppServer({DB,adminSetupToken:token,publicOrigin:'https://test.onrender.com'});await new Promise(r=>server.listen(0,'127.0.0.1',r));const local='http://127.0.0.1:'+server.address().port;
 try{
  let r=await fetch(local+'/health');assert.equal(r.status,200);
  r=await fetch(local+'/app.html');assert.equal(r.status,200);assert.match(await r.text(),/theme.js/);
  r=await fetch(local+'/.env');assert.equal(r.status,404);
  const body={email:'admin@example.test',name:'Admin Test',password:crypto.randomUUID()};
  const call=(headers)=>fetch(local+'/api/admin/setup',{method:'POST',headers:{'Content-Type':'application/json','X-Setup-Token':token,...headers},body:JSON.stringify(body)});
  r=await call({Origin:'https://evil.test'});assert.equal(r.status,403);
  r=await call({Origin:'https://test.onrender.com'});assert.equal(r.status,201);const cookie=r.headers.get('set-cookie').split(';')[0];assert.match(cookie,/^__Host-servimatch_session=/);assert.match(r.headers.get('set-cookie'),/Secure/);
  r=await fetch(local+'/api/me',{headers:{Cookie:cookie}});assert.equal((await r.json()).user.role,'admin');
  r=await fetch(local+'/api/logout',{method:'POST',headers:{Origin:'https://test.onrender.com','Content-Type':'application/json',Cookie:cookie},body:'{}'});assert.equal(r.status,200);
  r=await fetch(local+'/api/state',{headers:{Cookie:cookie}});assert.equal(r.status,401);
  await new Promise(r=>server.close(r));DB.close();DB=await createDatabase({url});const u=await DB.prepare("SELECT * FROM users WHERE role='admin'").first();assert.equal(u.email,body.email);assert(u.password_hash.startsWith('scrypt$'));assert.equal((await DB.prepare('SELECT COUNT(*) AS count FROM schema_migrations').first()).count,4);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(()=>r()));DB.close();await rm(work,{recursive:true,force:true})}
});

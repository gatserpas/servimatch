import { scryptAsync } from '@noble/hashes/scrypt.js';
const N=32768,R=8,P=3,TTL=8*60*60;
const bytesToHex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const random=()=>bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
const digest=async value=>bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));
export class AuthError extends Error {constructor(status,message){super(message);this.status=status}}
const json=(body,status=200,cookie)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff',...(cookie?{'Set-Cookie':cookie}:{})}});
function email(value){if(typeof value!=='string'||value.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(value.trim()))throw new AuthError(400,'Ingresa un correo válido.');return value.trim().toLowerCase()}
export function password(value){if(typeof value!=='string'||value.length<15||value.length>128)throw new AuthError(400,'La contraseña debe tener entre 15 y 128 caracteres.');return value}
const field=(v,name,min=2,max=80)=>{if(typeof v!=='string'||v.trim().length<min||v.trim().length>max)throw new AuthError(400,`${name}: revisa el valor ingresado.`);return v.trim()};
let kdfQueue=Promise.resolve(),pendingKdf=0;
async function derive(pass,salt){if(pendingKdf>=4)throw new AuthError(503,'Hay varios accesos en proceso. Inténtalo nuevamente en unos segundos.');pendingKdf++;let release;const before=kdfQueue;kdfQueue=new Promise(r=>release=r);await before;try{return bytesToHex(await scryptAsync(pass,salt,{N,r:R,p:P,dkLen:32,maxmem:64*1024*1024,asyncTick:10}))}finally{pendingKdf--;release()}}
export async function hashPassword(pass){password(pass);const salt=random();return `scrypt$${N}$${R}$${P}$${salt}$${await derive(pass,salt)}`}
export async function verifyPassword(pass,stored){const bits=stored?.split('$');const valid=bits?.length===6&&bits[0]==='scrypt'&&bits[1]==='32768'&&bits[2]==='8'&&bits[3]==='3'&&/^[0-9a-f]{64}$/.test(bits[4])&&/^[0-9a-f]{64}$/.test(bits[5]);const computed=await derive(pass,valid?bits[4]:'0'.repeat(64));const expected=valid?bits[5]:'0'.repeat(64);let diff=0;for(let i=0;i<64;i++)diff|=computed.charCodeAt(i)^expected.charCodeAt(i);return Boolean(valid&&diff===0)}
const cookieName=req=>new URL(req.url).protocol==='https:'?'__Host-servimatch_session':'servimatch_session';
const cookie=(req,value,maxAge)=>`${cookieName(req)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${new URL(req.url).protocol==='https:'?'; Secure':''}`;
const cookieToken=req=>req.headers.get('Cookie')?.split(';').map(p=>p.trim()).find(p=>p.startsWith(cookieName(req)+'='))?.slice(cookieName(req).length+1);
export function safeUser(user){return user?{id:user.id,email:user.email,name:user.name,phone:user.phone,role:user.role,mustChangePassword:!!user.must_change_password}:null}
async function currentUser(req,db){const token=cookieToken(req);if(!token||!/^[a-f0-9]{64}$/.test(token))return null;return db.prepare('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires>?').bind(await digest(token),Date.now()).first()}
async function dropSession(req,db){const token=cookieToken(req);if(token)await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(token)).run()}
async function sessionResponse(req,db,user,status=200){await dropSession(req,db);const token=random();await db.prepare('INSERT INTO sessions(token_hash,user_id,expires) VALUES(?,?,?)').bind(await digest(token),user.id,Date.now()+TTL*1000).run();return json({user:safeUser(user)},status,cookie(req,token,TTL))}
async function limit(db,key,max){const now=Date.now();await db.prepare('INSERT INTO auth_limits(key,attempts,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires<=? THEN 1 ELSE attempts+1 END,expires=CASE WHEN expires<=? THEN ? ELSE expires END').bind(key,now+15*60*1000,now,now,now+15*60*1000).run();const row=await db.prepare('SELECT * FROM auth_limits WHERE key=?').bind(key).first();if(row.attempts>max)throw new AuthError(429,'Demasiados intentos. Espera 15 minutos antes de volver a intentar.')}
async function loginLimit(request,db,mail){await limit(db,'mail:'+await digest(mail),15);const ip=request.headers.get('CF-Connecting-IP');if(ip)await limit(db,'ip:'+await digest(ip),60)}
async function canSetup(req,env,identity){
 const admin=await env.DB.prepare("SELECT id FROM users WHERE role='admin' AND password_hash IS NOT NULL LIMIT 1").first();if(admin)return false;
 if(env.ADMIN_SETUP_TOKEN){const token=req.headers.get('X-Setup-Token');return typeof token==='string'&&token.length===64&&token===env.ADMIN_SETUP_TOKEN}
 return false;
}
export async function handleAuth(request,env,identity){const path=new URL(request.url).pathname,method=request.method,db=env.DB;let user=await currentUser(request,db);
 if(path==='/api/me'&&method==='GET')return {response:json({user:safeUser(user),canSetupAdmin:await canSetup(request,env,identity)})};
 if(path==='/api/logout'&&method==='POST'){await dropSession(request,db);return {response:json({ok:true},200,cookie(request,'',0))}}
 if(path==='/api/login'&&method==='POST'){
  const b=await request.json(),mail=email(b.email);await loginLimit(request,db,mail);const pass=typeof b.password==='string'&&b.password.length<=128?b.password:'';
  const found=await db.prepare('SELECT * FROM users WHERE email=?').bind(mail).first();const correct=await verifyPassword(pass,found?.password_hash);
  if(!correct)throw new AuthError(401,'Correo o contraseña incorrectos.');
  await db.prepare('DELETE FROM auth_limits WHERE key=?').bind('mail:'+await digest(mail)).run();
  await db.prepare('DELETE FROM sessions WHERE expires<=?').bind(Date.now()).run();return {response:await sessionResponse(request,db,found)};
 }
 if(path==='/api/register'&&method==='POST'){
  const b=await request.json();if(b.role&&b.role!=='client')throw new AuthError(403,'El registro público es únicamente para clientes.');const mail=email(b.email);await loginLimit(request,db,mail);
  const existing=await db.prepare('SELECT id FROM users WHERE email=?').bind(mail).first();if(existing)throw new AuthError(409,'Este correo ya está registrado. Inicia sesión o solicita una clave temporal al administrador.');
  // Reserve the initial administrator address before setup; registration cannot claim it as client.
  if(env.ADMIN_EMAIL&&mail===env.ADMIN_EMAIL.trim().toLowerCase())throw new AuthError(403,'Esta dirección está reservada para administración.');
  const name=field(b.name,'Nombre'),phone=field(b.phone,'Teléfono',8,20);const hash=await hashPassword(b.password),id=crypto.randomUUID();
  try{await db.prepare("INSERT INTO users(id,email,name,phone,role,password_hash,must_change_password,created) VALUES(?,?,?,?,'client',?,0,?)").bind(id,mail,name,phone,hash,new Date().toISOString()).run()}catch(e){if(String(e).includes('UNIQUE'))throw new AuthError(409,'Este correo ya está registrado.');throw e}
  user=await db.prepare('SELECT * FROM users WHERE id=?').bind(id).first();return {response:await sessionResponse(request,db,user,201)};
 }
 if(path==='/api/admin/setup'&&method==='POST'){
  if(!await canSetup(request,env,identity))throw new AuthError(403,'La configuración inicial no está autorizada.');
  const b=await request.json();const mail=email(b.email);const hash=await hashPassword(b.password),name=field(b.name,'Nombre');
  const existing=await db.prepare('SELECT * FROM users WHERE email=?').bind(mail).first();if(existing&&existing.role!=='admin')throw new AuthError(409,'Este correo pertenece a otro rol. Usa otro correo.');
  const id=existing?.id||crypto.randomUUID();
  // A unique sentinel inside the transaction prevents two concurrent initial setups.
  try{await db.batch([db.prepare("INSERT INTO auth_limits(key,attempts,expires) VALUES('admin-setup-complete',1,0)"),existing?db.prepare('UPDATE users SET password_hash=?,must_change_password=0,name=? WHERE id=? AND password_hash IS NULL').bind(hash,name,id):db.prepare("INSERT INTO users(id,email,name,phone,role,password_hash,must_change_password,created) VALUES(?,?,?,'','admin',?,0,?)").bind(id,mail,name,hash,new Date().toISOString())])}catch(e){if(String(e).includes('UNIQUE'))throw new AuthError(409,'La configuración ya fue completada. Inicia sesión.');throw e}
  user=await db.prepare('SELECT * FROM users WHERE id=?').bind(id).first();return {response:await sessionResponse(request,db,user,201)};
 }
 if(path==='/api/password'&&method==='POST'){
  if(!user)throw new AuthError(401,'Inicia sesión para continuar.');const b=await request.json();await loginLimit(request,db,user.email);
  if(typeof b.currentPassword!=='string'||b.currentPassword.length>128||!await verifyPassword(b.currentPassword,user.password_hash))throw new AuthError(401,'La contraseña actual es incorrecta.');
  if(b.password===b.currentPassword)throw new AuthError(400,'Elige una contraseña diferente a la actual.');const hash=await hashPassword(b.password);
  await db.batch([db.prepare('UPDATE users SET password_hash=?,must_change_password=0 WHERE id=?').bind(hash,user.id),db.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id)]);
  user={...user,password_hash:hash,must_change_password:0};return {response:await sessionResponse(request,db,user)};
 }
 if(!user)throw new AuthError(401,'Inicia sesión para continuar.');
 if(user.must_change_password)throw new AuthError(403,'Debes cambiar tu contraseña temporal antes de continuar.');
 return {user};
}

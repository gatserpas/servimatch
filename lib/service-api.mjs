import {community,communityState} from './community.mjs';
import {handleAuth,AuthError,hashPassword} from './auth.mjs';
import {SERVICES,validateProfessional,applicationView} from './professional.mjs';
export {SERVICES};
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'}});
class HttpError extends Error{constructor(status,message){super(message);this.status=status}}
function requireRole(u,role){if(!u||u.role!==role)throw new HttpError(403,'No tienes permiso para realizar esta acción.')}
function field(v,label,min=1,max=200){if(typeof v!=='string'||v.trim().length<min||v.trim().length>max)throw new HttpError(400,`${label}: revisa el valor ingresado.`);return v.trim()}
const phone=v=>field(v,'Teléfono',8,20);const email=v=>{const e=field(v,'Correo',3,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))throw new HttpError(400,'Ingresa un correo válido.');return e};
const initials=name=>name.split(/\s+/).slice(0,2).map(n=>n[0]).join('').toUpperCase();
function publicUser(u){return u?{id:u.id,email:u.email,name:u.name,phone:u.phone,role:u.role,photo:u.photo||'',premiumUntil:u.premium_until||null}:null}
export async function handleApi(request,env,identity){try{
 const url=new URL(request.url),path=url.pathname,method=request.method,db=env.DB;
 if(!db)throw new HttpError(503,'La base de datos no está configurada.');
 const bodyLimit=path==='/api/professional/profile'?1100000:path==='/api/profile/photo'?180000:16000;
 if(method!=='GET'){
  if(request.headers.get('Origin')!==url.origin)throw new HttpError(403,'Origen de la solicitud no permitido.');
  if(!request.headers.get('Content-Type')?.includes('application/json'))throw new HttpError(415,'Se requiere JSON.');
  if(Number(request.headers.get('Content-Length')||0)>bodyLimit)throw new HttpError(413,'Solicitud demasiado grande.');const raw=await request.text();if(new TextEncoder().encode(raw).length>bodyLimit)throw new HttpError(413,'Solicitud demasiado grande.');const parsed=JSON.parse(raw);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new HttpError(400,'Se requiere un objeto JSON.');request.json=async()=>parsed;
 }
 const authentication=await handleAuth(request,env,identity);if(authentication.response)return authentication.response;const user=authentication.user;

 if(path==='/api/profile/photo'&&method==='POST'){
  const b=await request.json(),photo=b.photo;
  if(typeof photo!=='string'||photo.length>175000||photo!==''&&!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(photo))throw new HttpError(400,'La foto debe ser JPEG y pesar menos de 130 KB.');
  if(photo){const bytes=Buffer.from(photo.split(',')[1],'base64');if(bytes.length>130000||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)throw new HttpError(400,'Foto inválida.');}
  await db.prepare('UPDATE users SET photo=? WHERE id=?').bind(photo,user.id).run();return reply({ok:true});
 }
 if(path==='/api/subscription'&&method==='POST'){
  requireRole(user,'worker');
  const b=await request.json();if(Object.keys(b).some(k=>k!=='action')||!['activate','cancel'].includes(b.action))throw new HttpError(400,'Solo se admite activar o cancelar la demostración. No envíes datos de pago.');
  const until=b.action==='activate'?new Date(Date.now()+30*86400000).toISOString():null;
  await db.prepare('UPDATE users SET premium_until=? WHERE id=?').bind(until,user.id).run();return reply({ok:true,premiumUntil:until});
 }
 const ownProfile=user.role==='worker'?await db.prepare('SELECT p.*,u.name,u.email,u.phone,u.photo,u.created FROM professionals p JOIN users u ON u.id=p.user_id WHERE p.user_id=?').bind(user.id).first():null;
 if(user.role==='worker'&&(!ownProfile||ownProfile.approval_status!=='approved')){
  if(path==='/api/state'&&method==='GET')return reply({user:publicUser(user),professionals:[],requests:[],application:applicationView(ownProfile),applications:[]});
  if(path==='/api/application'&&method==='POST'&&ownProfile){const b=await request.json(),profile=validateProfessional(b,HttpError);const update=await db.prepare("UPDATE professionals SET service=?,price=?,bio=?,zone=?,experience=?,approval_status='pending',application_version=application_version+1,available=0,review_note='',reviewed_at=NULL,reviewed_by=NULL WHERE id=? AND approval_status IN ('pending','rejected')").bind(profile.service,profile.price,profile.bio,profile.zone,profile.experience,ownProfile.id).run();if(!update.meta.changes)throw new HttpError(409,'La solicitud cambió. Actualiza la pantalla.');return reply({ok:true})}
  throw new HttpError(403,'Tu perfil profesional debe ser aprobado antes de acceder a los servicios.');
 }
 const social=await community(request,db,user,HttpError);if(social)return social;
 if(path==='/api/applications'&&method==='GET'){requireRole(user,'admin');const list=(await db.prepare('SELECT p.*,u.name,u.email,u.phone,u.photo,u.created FROM professionals p JOIN users u ON u.id=p.user_id ORDER BY u.created DESC').all()).results;return reply({applications:list.map(applicationView)})}
 const review=path.match(/^\/api\/applications\/(\d+)\/review$/);
 if(review&&method==='POST'){requireRole(user,'admin');const b=await request.json();if(!['approve','reject'].includes(b.action))throw new HttpError(400,'Acción de revisión inválida.');if(!Number.isInteger(b.version)||b.version<1)throw new HttpError(400,'Actualiza la postulación antes de revisarla.');const note=b.action==='reject'?field(b.reason,'Motivo de rechazo',5,500):'';const status=b.action==='approve'?'approved':'rejected';const result=await db.prepare("UPDATE professionals SET approval_status=?,available=?,review_note=?,reviewed_at=?,reviewed_by=? WHERE id=? AND approval_status='pending' AND application_version=?").bind(status,status==='approved'?1:0,note,new Date().toISOString(),user.id,Number(review[1]),b.version).run();if(!result.meta.changes)throw new HttpError(409,'Esta postulación ya fue revisada o no existe.');return reply({ok:true})}
 if(path==='/api/state'&&method==='GET'){
  const workers=(await (user.role==='worker'?db.prepare('SELECT p.*,u.name,u.email,u.phone,u.photo FROM professionals p JOIN users u ON u.id=p.user_id WHERE p.user_id=?').bind(user.id):db.prepare("SELECT p.*,u.name,u.email,u.phone,u.photo FROM professionals p JOIN users u ON u.id=p.user_id WHERE p.approval_status='approved' ORDER BY p.id")).all()).results;
  const inService=(await db.prepare("SELECT pro FROM requests WHERE status='En curso' AND pro IS NOT NULL GROUP BY pro").all()).results;const busyIds=new Set(inService.map(r=>r.pro));
  let rows;if(user.role==='admin')rows=(await db.prepare('SELECT r.*,u.photo AS client_photo FROM requests r LEFT JOIN users u ON u.id=r.client_id ORDER BY updated DESC').all()).results;
  else if(user.role==='client')rows=(await db.prepare('SELECT r.*,u.photo AS client_photo FROM requests r LEFT JOIN users u ON u.id=r.client_id WHERE client_id=? ORDER BY updated DESC').bind(user.id).all()).results;
  else {const p=workers.find(p=>p.user_id===user.id);rows=p?(await db.prepare("SELECT r.*,u.photo AS client_photo FROM requests r LEFT JOIN users u ON u.id=r.client_id WHERE json_extract(payload,'$.service')=? AND (pro=? OR (pro IS NULL AND status='Pendiente')) ORDER BY updated DESC").bind(p.service,p.id).all()).results:[]}
  const applications=user.role==='admin'?(await db.prepare('SELECT p.*,u.name,u.email,u.phone,u.photo,u.created FROM professionals p JOIN users u ON u.id=p.user_id ORDER BY u.created DESC').all()).results.map(applicationView):[];
  const socialState=await communityState(db,user);
  return reply({community:socialState,user:publicUser(user),application:null,applications,professionals:workers.map(p=>({id:p.id,name:p.name,initials:initials(p.name),photo:p.photo||'',service:p.service,zone:p.zone,experience:p.experience,price:p.price/100,bio:p.bio,completed:socialState.stats.find(s=>s.id===p.id)?.completed||0,rating:socialState.stats.find(s=>s.id===p.id)?.rating||null,reviewCount:socialState.stats.find(s=>s.id===p.id)?.review_count||0,available:!!p.available,status:busyIds.has(p.id)?'busy':p.available?'available':'inactive',...(user.role==='admin'?{email:p.email,phone:p.phone,userId:p.user_id}:{}),...(p.user_id===user.id?{mine:true}:{})})),requests:rows.map(r=>{const data=JSON.parse(r.payload);return user.role==='worker'&&r.pro===null?{id:r.id,service:data.service,description:data.description,date:data.date,time:data.time,created:data.created,status:r.status,pro:null,redacted:true,client:'Cliente de ServiMatch',history:[]}:{...data,id:r.id,clientId:r.client_id,clientPhoto:r.client_photo||'',pro:r.pro,suggestedPro:r.suggested_pro,status:r.status}})});
 }
 if(path==='/api/professionals'&&method==='POST'){
  requireRole(user,'admin');const b=await request.json();const service=field(b.service,'Especialidad');if(!SERVICES.includes(service))throw new HttpError(400,'Especialidad no válida.');
  const price=Number(b.price);if(!Number.isFinite(price)||price<0||price>10000)throw new HttpError(400,'Tarifa no válida.');
  const hash=await hashPassword(b.password);const id=crypto.randomUUID(),name=field(b.name,'Nombre',2,80),mail=email(b.email),tel=phone(b.phone),bio=field(b.bio,'Descripción',10,1000);
  const exists=await db.prepare('SELECT id FROM users WHERE email=?').bind(mail).first();if(exists)throw new HttpError(409,'Ese correo ya pertenece a una cuenta. Usa un correo distinto.');
  try{await db.batch([db.prepare("INSERT INTO users(id,email,name,phone,role,password_hash,must_change_password,created) VALUES (?,?,?,?,'worker',?,1,?)").bind(id,mail,name,tel,hash,new Date().toISOString()),db.prepare('INSERT INTO professionals(user_id,service,price,bio) VALUES (?,?,?,?)').bind(id,service,Math.round(price*100),bio)])}catch(e){if(String(e).includes('UNIQUE'))throw new HttpError(409,'Ese correo ya está registrado.');throw e}
  return reply({ok:true},201);
 }
 if(path==='/api/accounts'&&method==='GET'){requireRole(user,'admin');const rows=(await db.prepare('SELECT id,name,email,photo,role,password_hash,must_change_password FROM users ORDER BY name').all()).results;return reply({accounts:rows.map(u=>({id:u.id,name:u.name,email:u.email,photo:u.photo||'',role:u.role,hasPassword:!!u.password_hash,mustChangePassword:!!u.must_change_password}))})}
 const reset=path.match(/^\/api\/accounts\/([^/]+)\/password$/);
 if(reset&&method==='POST'){requireRole(user,'admin');const target=await db.prepare('SELECT id,role FROM users WHERE id=?').bind(reset[1]).first();if(!target)throw new HttpError(404,'Cuenta no encontrada.');if(target.role==='admin')throw new HttpError(403,'El administrador cambia su contraseña desde su perfil.');const b=await request.json(),hash=await hashPassword(b.password);await db.batch([db.prepare('UPDATE users SET password_hash=?,must_change_password=1 WHERE id=?').bind(hash,target.id),db.prepare('DELETE FROM sessions WHERE user_id=?').bind(target.id)]);return reply({ok:true})}
 if(path==='/api/availability'&&method==='POST'){requireRole(user,'worker');const b=await request.json();if(typeof b.available!=='boolean')throw new HttpError(400,'Valor inválido.');await db.prepare('UPDATE professionals SET available=? WHERE user_id=?').bind(b.available?1:0,user.id).run();return reply({ok:true})}
 if(path==='/api/requests'&&method==='POST'){
  requireRole(user,'client');const b=await request.json();const pro=await db.prepare("SELECT p.*,u.name FROM professionals p JOIN users u ON u.id=p.user_id WHERE p.id=? AND p.available=1 AND p.approval_status='approved'").bind(Number(b.professional)).first();if(!pro)throw new HttpError(400,'El profesional no está disponible.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(b.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time))throw new HttpError(400,'Fecha u hora inválidas.');
  const when=new Date(b.date+'T'+b.time+':00-06:00');if(!Number.isFinite(when.getTime())||when<=new Date())throw new HttpError(400,'Selecciona una fecha y hora futuras.');
  const now=new Date().toISOString(),id='SM-'+crypto.randomUUID();const payload={service:pro.service,client:user.name,phone:user.phone,address:field(b.address,'Dirección',5,200),description:field(b.description,'Detalles',10,1000),date:b.date,time:b.time,created:now,history:[{status:'Pendiente',at:now}]};
  await db.prepare("INSERT INTO requests(id,client_id,pro,suggested_pro,status,payload,updated) VALUES (?,?,NULL,?,'Pendiente',?,?)").bind(id,user.id,pro.id,JSON.stringify(payload),now).run();return reply({ok:true,id},201);
 }
 const match=path.match(/^\/api\/requests\/([^/]+)\/(assign|transition)$/);
 if(match&&method==='POST'){
  const r=await db.prepare('SELECT * FROM requests WHERE id=?').bind(match[1]).first();if(!r)throw new HttpError(404,'Solicitud no encontrada.');
  const b=await request.json();let status,pro=r.pro;
  if(match[2]==='assign'){
   requireRole(user,'admin');if(!['Pendiente','Asignado'].includes(r.status))throw new HttpError(409,'Solo se pueden asignar servicios pendientes o sin aceptar.');
   const p=await db.prepare("SELECT * FROM professionals WHERE id=? AND available=1 AND approval_status='approved'").bind(Number(b.professional)).first();if(!p||p.service!==JSON.parse(r.payload).service)throw new HttpError(400,'Selecciona un profesional disponible de la especialidad solicitada.');pro=p.id;status='Asignado';
  }else {
   status=b.status;let allowed=false;
   if(user.role==='client'&&r.client_id===user.id&&['Pendiente','Asignado','Confirmado'].includes(r.status)&&status==='Cancelado')allowed=true;
   if(user.role==='worker'){
    const mine=await db.prepare('SELECT id FROM professionals WHERE user_id=?').bind(user.id).first();
    if(mine?.id===r.pro&&JSON.parse(r.payload).service===(await db.prepare('SELECT service FROM professionals WHERE id=?').bind(mine.id).first()).service&&({Asignado:['Confirmado','Pendiente'],Confirmado:['En curso'],'En curso':['Completado']}[r.status]||[]).includes(status))allowed=true;
   }
   if(!allowed)throw new HttpError(403,'No puedes realizar este cambio de estado.');if(status==='Pendiente')pro=null;
  }
  const now=new Date().toISOString(),payload=JSON.parse(r.payload);payload.history.push({status,at:now});
  const result=await db.prepare('UPDATE requests SET status=?,pro=?,payload=?,updated=? WHERE id=? AND status=? AND updated=?').bind(status,pro,JSON.stringify(payload),now,r.id,r.status,r.updated).run();if(!result.meta.changes)throw new HttpError(409,'El servicio cambió. Actualiza e inténtalo nuevamente.');return reply({ok:true});
 }
 throw new HttpError(404,'Ruta no encontrada.');
 }catch(e){if(e instanceof HttpError||e instanceof AuthError)return reply({error:e.message},e.status);if(e instanceof SyntaxError)return reply({error:'Solicitud JSON inválida.'},400);console.error('ServiMatch API error',e);return reply({error:'No se pudo completar la operación. Inténtalo nuevamente.'},500)}}

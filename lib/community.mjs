const response=b=>Response.json(b,{headers:{'Cache-Control':'no-store'}});
export async function community(request,db,user,fail){
 const path=new URL(request.url).pathname,method=request.method;
 const text=(v,label,min,max)=>{if(typeof v!=='string'||v.trim().length<min||v.trim().length>max)throw new fail(400,`${label}: revisa el contenido.`);return v.trim()};
 if(path==='/api/professional/profile'&&method==='POST'){
  if(user.role!=='worker')throw new fail(403,'Solo el profesional puede editar su perfil.');
  const b=await request.json();const details={specialties:text(b.specialties||'','Especialidades',0,500),schedule:text(b.schedule||'','Horarios',0,300),training:text(b.training||'','Formación',0,500),conditions:text(b.conditions||'','Condiciones',0,500)};
  const bio=text(b.bio,'Presentación',10,1000),zone=text(b.zone,'Zona',2,200),experience=text(b.experience,'Experiencia',2,500);
  if(!Array.isArray(b.portfolio)||b.portfolio.length>6)throw new fail(400,'Agrega hasta seis trabajos al portafolio.');
  details.portfolio=b.portfolio.map(item=>{const title=text(item.title,'Título del trabajo',3,100),description=text(item.description||'','Descripción del trabajo',0,500),photo=item.photo;if(typeof photo!=='string'||photo.length>175000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(photo))throw new fail(400,'Imagen del portafolio inválida.');const bytes=Buffer.from(photo.split(',')[1],'base64');if(bytes.length>130000||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)throw new fail(400,'Imagen del portafolio inválida.');return {title,description,photo}});
  await db.prepare('UPDATE professionals SET bio=?,zone=?,experience=?,profile_details=? WHERE user_id=?').bind(bio,zone,experience,JSON.stringify(details),user.id).run();return response({ok:true});
 }
 const profile=path.match(/^\/api\/professionals\/(\d+)\/profile$/);
 if(profile&&method==='GET'){
  const p=await db.prepare("SELECT profile_details FROM professionals WHERE id=? AND approval_status='approved'").bind(Number(profile[1])).first();if(!p)throw new fail(404,'Perfil no encontrado.');
  const reviews=(await db.prepare('SELECT r.rating,r.comment,r.created,u.name FROM reviews r JOIN users u ON u.id=r.client_id WHERE r.pro_id=? ORDER BY r.created DESC LIMIT 50').bind(Number(profile[1])).all()).results;
  return response({details:JSON.parse(p.profile_details),reviews});
 }
 const route=path.match(/^\/api\/requests\/([^/]+)\/(messages|read|review)$/);if(!route)return null;
 const r=await db.prepare('SELECT * FROM requests WHERE id=?').bind(route[1]).first();if(!r)throw new fail(404,'Servicio no encontrado.');
 const worker=r.pro?await db.prepare('SELECT user_id FROM professionals WHERE id=?').bind(r.pro).first():null;
 if(!worker||!(user.role==='client'&&user.id===r.client_id||user.role==='worker'&&user.id===worker.user_id))throw new fail(403,'Esta conversación es privada entre el cliente y el profesional asignado.');
 if(route[2]==='messages'&&method==='GET'){
  const messages=(await db.prepare('SELECT m.id,m.sender_id,m.body,m.created,u.name FROM chat_messages m JOIN users u ON u.id=m.sender_id WHERE m.request_id=? AND m.pro_id=? ORDER BY m.id DESC LIMIT 100').bind(r.id,r.pro).all()).results.reverse();return response({messages,readOnly:['Completado','Cancelado'].includes(r.status),requestId:r.id});
 }
 if(route[2]==='messages'&&method==='POST'){
  const b=await request.json(),body=text(b.body,'Mensaje',1,2000),now=new Date().toISOString();
  // Check assignment and state again inside the write to avoid sending after reassignment/closure.
  const result=await db.prepare("INSERT INTO chat_messages(request_id,pro_id,sender_id,body,created) SELECT id,pro,?,?,? FROM requests WHERE id=? AND pro=? AND status NOT IN ('Completado','Cancelado')").bind(user.id,body,now,r.id,r.pro).run();if(!result.meta.changes)throw new fail(409,'El servicio cambió o el chat es de solo lectura.');return response({ok:true});
 }
 if(route[2]==='read'&&method==='POST'){
  const b=await request.json();if(!Number.isSafeInteger(b.lastId)||b.lastId<0)throw new fail(400,'Lectura inválida.');
  const last=await db.prepare('SELECT COALESCE(MAX(id),0) AS id FROM chat_messages WHERE request_id=? AND pro_id=?').bind(r.id,r.pro).first();
  await db.prepare('INSERT INTO chat_reads(request_id,pro_id,user_id,last_id) VALUES(?,?,?,?) ON CONFLICT(request_id,pro_id,user_id) DO UPDATE SET last_id=MAX(last_id,excluded.last_id)').bind(r.id,r.pro,user.id,Math.min(b.lastId,last.id)).run();return response({ok:true});
 }
 if(route[2]==='review'&&method==='POST'){
  if(user.role!=='client'||r.status!=='Completado')throw new fail(403,'Solo el cliente puede reseñar un servicio completado.');
  const b=await request.json();if(!Number.isInteger(b.rating)||b.rating<1||b.rating>5)throw new fail(400,'Selecciona de 1 a 5 estrellas.');const comment=text(b.comment,'Reseña',5,1000);
  const result=await db.prepare("INSERT INTO reviews(request_id,pro_id,client_id,rating,comment,created) SELECT id,pro,client_id,?,?,? FROM requests WHERE id=? AND pro=? AND status='Completado' ON CONFLICT(request_id) DO NOTHING").bind(b.rating,comment,new Date().toISOString(),r.id,r.pro).run();if(!result.meta.changes)throw new fail(409,'Este servicio ya tiene una reseña.');return response({ok:true});
 }
 return null;
}
export async function communityState(db,user){
 const stats=(await db.prepare("SELECT p.id,(SELECT COUNT(*) FROM requests WHERE pro=p.id AND status='Completado') AS completed,(SELECT COUNT(*) FROM reviews WHERE pro_id=p.id) AS review_count,(SELECT AVG(rating) FROM reviews WHERE pro_id=p.id) AS rating FROM professionals p").all()).results;
 const unread=(await db.prepare('SELECT m.request_id,COUNT(*) AS total FROM chat_messages m JOIN requests r ON r.id=m.request_id AND r.pro=m.pro_id JOIN professionals p ON p.id=r.pro LEFT JOIN chat_reads cr ON cr.request_id=r.id AND cr.pro_id=r.pro AND cr.user_id=? WHERE (r.client_id=? OR p.user_id=?) AND m.sender_id<>? AND m.id>COALESCE(cr.last_id,0) GROUP BY m.request_id').bind(user.id,user.id,user.id,user.id).all()).results;
 const reviewed=(await db.prepare('SELECT request_id FROM reviews WHERE client_id=?').bind(user.id).all()).results;
 return {stats,unread,reviewed};
}

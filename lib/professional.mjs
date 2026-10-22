export const SERVICES=['Fontanería','Electricidad','Pintura','Limpieza','Jardinería','Mudanzas y armado','Soporte tecnológico','Clases particulares'];
export function validateProfessional(body,ErrorType){
 const text=(value,label,min,max)=>{if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)throw new ErrorType(400,`${label}: revisa el valor ingresado.`);return value.trim()};
 const service=text(body.service,'Especialidad',2,80);if(!SERVICES.includes(service))throw new ErrorType(400,'Selecciona una especialidad válida.');
 const zone=text(body.zone,'Zona de trabajo',2,200),experience=text(body.experience,'Experiencia',2,500),bio=text(body.bio,'Descripción',10,1000),price=Number(body.price);
 if(body.price===''||body.price===null||body.price===undefined||!Number.isFinite(price)||price<0||price>10000)throw new ErrorType(400,'Ingresa una tarifa válida entre 0 y 10000 USD.');
 return {service,zone,experience,bio,price:Math.round(price*100)};
}
export const applicationView=p=>p?{id:p.id,name:p.name,photo:p.photo||'',email:p.email,phone:p.phone,service:p.service,zone:p.zone,experience:p.experience,bio:p.bio,price:p.price/100,approvalStatus:p.approval_status,version:p.application_version,reviewNote:p.review_note||'',reviewedAt:p.reviewed_at,created:p.created}:null;

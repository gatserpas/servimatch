import {createServer} from 'node:http';import {readFile} from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';import {handleApi} from './lib/service-api.mjs';import {createDatabase} from './lib/database.mjs';
const root=new URL('./public/',import.meta.url),mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.webmanifest':'application/manifest+json','.svg':'image/svg+xml'};
export function createAppServer({DB,adminSetupToken,publicOrigin}){
 const origin=new URL(publicOrigin).origin;
 return createServer(async(req,res)=>{
  const security={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"};
  try{
   if(!req.url?.startsWith('/')||req.url.startsWith('//')){res.writeHead(400,security);res.end();return}
   const url=new URL(req.url,origin);
   if(url.pathname==='/health'){await DB.prepare('SELECT 1 AS ok').first();res.writeHead(200,{...security,'Content-Type':'application/json'});res.end('{"ok":true}');return}
   if(url.pathname.startsWith('/api/')){
    let bytes=0;const chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>16000){res.writeHead(413,security);res.end();return}chunks.push(chunk)}
    const headers=new Headers(req.headers);headers.delete('CF-Connecting-IP');
    const response=await handleApi(new Request(url,{method:req.method,headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})}),{DB,ADMIN_SETUP_TOKEN:adminSetupToken});
    res.writeHead(response.status,{...security,...Object.fromEntries(response.headers)});res.end(Buffer.from(await response.arrayBuffer()));return;
   }
   if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,security);res.end();return}
   const name=url.pathname==='/'?'app.html':decodeURIComponent(url.pathname).slice(1),file=new URL(name,root);
   if(file.protocol!=='file:'||!file.pathname.startsWith(root.pathname)||name.includes('\\')){res.writeHead(403,security);res.end();return}
   const data=await readFile(file);res.writeHead(200,{...security,'Content-Type':mime[path.extname(name)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:data);
  }catch(error){res.writeHead(error.code==='ENOENT'?404:500,{...security,'Content-Type':'text/plain; charset=utf-8'});res.end('No se pudo completar la solicitud.');}
 });
}
async function main(){
 const {TURSO_DATABASE_URL:url,TURSO_AUTH_TOKEN:authToken,ADMIN_SETUP_TOKEN:adminSetupToken}=process.env;
 if(!url||!authToken||!/^https:|^libsql:/.test(url))throw new Error('Configura TURSO_DATABASE_URL y TURSO_AUTH_TOKEN de una base libSQL de Turso.');
 if(!/^[a-f0-9]{64}$/.test(adminSetupToken||''))throw new Error('ADMIN_SETUP_TOKEN debe contener 64 caracteres hexadecimales.');
 const port=Number(process.env.PORT||3000);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Puerto no válido.');
 const publicOrigin=process.env.PUBLIC_URL||process.env.RENDER_EXTERNAL_URL;if(!publicOrigin)throw new Error('Configura PUBLIC_URL o despliega en Render.');
 const parsed=new URL(publicOrigin);if(process.env.NODE_ENV==='production'&&parsed.protocol!=='https:')throw new Error('La URL pública debe usar HTTPS.');
 const DB=await createDatabase({url,authToken});const server=createAppServer({DB,adminSetupToken,publicOrigin});
 server.listen(port,'0.0.0.0',()=>console.log('ServiMatch listo. Puerto:',port));
 const stop=()=>{server.close(()=>{DB.close();process.exit(0)});setTimeout(()=>process.exit(1),10000).unref()};process.on('SIGTERM',stop);process.on('SIGINT',stop);
 server.on('error',()=>{console.error('No se pudo abrir el puerto de ServiMatch.');DB.close();process.exitCode=1});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error.message?.startsWith('Configura')||error.message?.startsWith('ADMIN_SETUP_TOKEN')?error.message:'No se pudo iniciar ServiMatch. Revisa la URL, el token y las migraciones de Turso.');process.exitCode=1});

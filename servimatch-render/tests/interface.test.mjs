import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const appSource=readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),themeSource=readFileSync(new URL('../public/theme.js',import.meta.url),'utf8');
function element(attributes=[]){const attrs=new Map(attributes.map(a=>[a,'']));return {innerHTML:'',textContent:'',style:{},disabled:false,open:false,dataset:{},classList:{add(){},remove(){}},setAttribute(k,v){attrs.set(k,v)},getAttribute(k){return attrs.get(k)},hasAttribute(k){return attrs.has(k)},closest(){return this},addEventListener(){},close(){this.open=false},showModal(){this.open=true}}}
test('header logout works again after signing back in, and recovers from network failure',async()=>{
 const events={},els=new Map(),header=element(['data-logout']),profile=element(['data-logout']);let authenticated=true,logoutCount=0,failLogout=false;
 const document={body:element(),querySelector(selector){if(!els.has(selector))els.set(selector,element());return els.get(selector)},querySelectorAll(selector){return selector==='[data-logout]'?[header,profile]:[]},addEventListener(name,cb){(events[name]??=[]).push(cb)}};
 const user={id:'client-1',name:'Cliente de Prueba',email:'client@example.test',role:'client',phone:'70000000'};
 const fetch=async(url)=>{const path=url.replace('/api/','');if(path==='logout'){logoutCount++;if(failLogout)return Response.json({error:'Network test'}, {status:500});authenticated=false;return Response.json({ok:true})}if(path==='me')return Response.json({user:authenticated?user:null,canSetupAdmin:false});if(path==='state')return Response.json({user,professionals:[],requests:[]});throw new Error('Unexpected API path: '+path)};
 const context=vm.createContext({document,window:{addEventListener(){},scrollTo(){}},navigator:{},location:{href:'http://example.test/'},history:{replaceState(){}},localStorage:{setItem(){}},URL,Response,fetch,Intl,Date,console,setTimeout(){return 1},clearTimeout(){}});
 vm.runInContext(appSource,context);await vm.runInContext('boot()',context);
 async function clickLogout(){assert.equal(header.disabled,false,'the persistent header button must be enabled');for(const cb of events.click)await cb({target:header})}
 await clickLogout();assert.equal(logoutCount,1);assert.match(els.get('#app').innerHTML,/id="loginForm"/);assert.equal(header.disabled,false);
 authenticated=true;await vm.runInContext('boot()',context);await clickLogout();assert.equal(logoutCount,2);assert.match(els.get('#app').innerHTML,/id="loginForm"/);
 authenticated=true;await vm.runInContext('boot()',context);failLogout=true;await clickLogout();assert.equal(header.disabled,false);failLogout=false;await clickLogout();assert.equal(logoutCount,4);assert.match(els.get('#app').innerHTML,/id="loginForm"/);
});
test('dark appearance persists on reload and updates accessible controls',()=>{
 const saved=new Map(),button=element(['data-theme-toggle']);
 function run(){const events={},root={dataset:{},style:{}},media={matches:false,addEventListener(){}};const document={documentElement:root,querySelector(){return element()},querySelectorAll(){return [button]},addEventListener(name,cb){events[name]=cb}};const context=vm.createContext({document,window:{matchMedia(){return media},addEventListener(){}},localStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)}});vm.runInContext(themeSource,context);return {root,events}}
 let page=run();assert.equal(page.root.dataset.theme,'light');page.events.click({target:button});assert.equal(page.root.dataset.theme,'dark');assert.equal(button.getAttribute('aria-pressed'),'true');assert.equal(saved.get('servimatch-theme'),'dark');page=run();assert.equal(page.root.dataset.theme,'dark');page.events.click({target:button});assert.equal(page.root.dataset.theme,'light');assert.equal(button.getAttribute('aria-label'),'Activar modo oscuro');
});
test('registration offers both roles and pending applicants see a restricted workspace',async()=>{
 const events={},elements=new Map(),document={body:element(),querySelector(s){if(!elements.has(s))elements.set(s,element());return elements.get(s)},querySelectorAll(){return []},addEventListener(name,cb){(events[name]??=[]).push(cb)}};
 const context=vm.createContext({document,window:{addEventListener(){},scrollTo(){}},navigator:{},location:{href:'http://example.test/'},history:{replaceState(){}},localStorage:{setItem(){}},URL,Response,fetch:async()=>Response.json({user:null,canSetupAdmin:false}),Intl,Date,console,setTimeout(){return 1},clearTimeout(){}});
 vm.runInContext(appSource,context);await vm.runInContext('boot()',context);vm.runInContext("authScreen('register')",context);
 let html=elements.get('#app').innerHTML;assert.match(html,/Necesito un servicio/);assert.match(html,/Quiero ofrecer mis servicios/);assert.match(html,/logo.png/);
 vm.runInContext("authScreen('register-worker')",context);html=elements.get('#app').innerHTML;for(const field of ['role','service','zone','experience','bio','price'])assert.match(html,new RegExp('name="'+field+'"'));assert.match(html,/pendiente de aprobación/);
 vm.runInContext("authScreen('register-client')",context);html=elements.get('#app').innerHTML;assert.match(html,/value="client"/);assert.doesNotMatch(html,/name="experience"/);
 vm.runInContext("currentUser={name:'Postulante',email:'test@example.test',role:'worker'};role='worker';application={id:1,service:'Fontanería',approvalStatus:'pending',zone:'San Salvador',experience:'2 años',price:25,bio:'Descripción de prueba'};render()",context);
 html=elements.get('#app').innerHTML;assert.match(html,/Pendiente de aprobación/);assert.match(html,/Consultar estado/);assert.doesNotMatch(elements.get('#desktopNav').innerHTML,/Mi jornada|Postulaciones|Mis trabajos/);
 vm.runInContext('demoCheckout()',context);assert.match(elements.get('#modalBody').innerHTML,/No hay cobro/);assert.doesNotMatch(elements.get('#modalBody').innerHTML,/name="(?:card|cvv)/);
 vm.runInContext('globalThis.sent=[];api=async(path,body)=>{sent.push({path,body});return {ok:true}};refresh=async()=>{}',context);
 let cleared=false,stopped=false;const form={id:'demoPaymentForm',reportValidity:()=>true,querySelector:()=>({disabled:false}),reset(){cleared=true}};
 await events.submit[0]({target:form,preventDefault(){},stopImmediatePropagation(){stopped=true}});
 assert(cleared);assert(stopped);assert.equal(JSON.stringify(context.sent),JSON.stringify([{path:'subscription',body:{action:'activate'}}]));
});

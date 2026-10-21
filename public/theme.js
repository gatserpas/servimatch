(() => {
 const key='servimatch-theme',system=window.matchMedia('(prefers-color-scheme: dark)');
 let preference;try{preference=localStorage.getItem(key)}catch{}
 const moon='<path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z"/>',sun='<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>';
 function syncButtons(){const dark=document.documentElement.dataset.theme==='dark';document.querySelectorAll('[data-theme-toggle]').forEach(button=>{const label=dark?'Activar modo claro':'Activar modo oscuro';button.setAttribute('aria-label',label);button.title=label;button.setAttribute('aria-pressed',String(dark));button.innerHTML=`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${dark?sun:moon}</svg><span class="theme-label">${dark?'Modo claro':'Modo oscuro'}</span>`})}
 function apply(theme){document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#111827':'#202953');syncButtons()}
 apply(preference==='dark'||preference==='light'?preference:system.matches?'dark':'light');
 document.addEventListener('DOMContentLoaded',syncButtons);
 document.addEventListener('click',event=>{if(!event.target.closest('[data-theme-toggle]'))return;preference=document.documentElement.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem(key,preference)}catch{}apply(preference)});
 system.addEventListener('change',()=>{if(preference!=='dark'&&preference!=='light')apply(system.matches?'dark':'light')});
 window.addEventListener('storage',event=>{if(event.key===key){preference=event.newValue;apply(preference==='dark'||preference==='light'?preference:system.matches?'dark':'light')}});
})();

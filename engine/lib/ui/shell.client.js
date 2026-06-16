// GENERADO a partir de run.client.js + panel.client.js por _mkshell.py — editar las FUENTES y regenerar

const E=s=>String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const fmt=n=>n>=1000?(n/1000).toFixed(1).replace(/\\.0$/,'')+'k':String(n);
const secs=ms=>{const s=Math.round(ms/1000);return s<60?s+'s':Math.floor(s/60)+'m '+String(s%60).padStart(2,'0')+'s'};
let API='/api/';
let S=null, skew=0, stop=false, lastJson='';
function card(k,n,id){return '<div class=card><small>'+k+'</small><span id='+id+'>'+n+'</span></div>'}
const PH_ICO={explore:'🔍',propose:'📝',clarify:'❓',spec:'📐',design:'🧩',tasks:'🗂️',apply:'🛠️',fix:'🔧',verify:'🛡️'};
const mIco=(m,prov)=>{const n=(m||'').toLowerCase();if(prov==='byok'||/qwen|deepseek/.test(n))return '🔑';if(/opus/.test(n))return '🧠';if(/sonnet/.test(n))return '🎼';if(/haiku/.test(n))return '⚡';if(/gpt|codex/.test(n))return '🤖';return '💼'};
const K={create:'<span style="color:var(--ok)">+ creado</span>',edit:'<span style="color:var(--warn)">± editado</span>',delete:'<span style="color:var(--bad)">− borrado</span>'};
const fp=f=>typeof f==='string'?{p:f,k:'create'}:f;
// kind: 'art' (artefacto del change → /api/artifact) | 'diff' (fichero del proyecto → /api/diff)
const item=(f,kind)=>'<code class=lnk data-p="'+E(f.p)+'" data-vk="'+kind+'">'+E(f.p)+'</code> '+(K[f.k]||'');
function fileBlock(key,files,label,kind){
  if(!files||!files.length)return '';
  const fs=files.map(fp);
  if(fs.length===1)return '<div class=files>'+label+': '+item(fs[0],kind)+'</div>';
  const nC=fs.filter(f=>f.k==='create').length,nE=fs.filter(f=>f.k==='edit').length,nD=fs.filter(f=>f.k==='delete').length;
  const sum=[nC?nC+' creados':'',nE?nE+' editados':'',nD?nD+' borrados':''].filter(Boolean).join(' · ');
  return '<details class=files data-k="'+key+'"><summary>'+fs.length+' '+label+' ('+sum+') — click para ver</summary><ul>'+fs.map(f=>'<li>'+item(f,kind)+'</li>').join('')+'</ul></details>';
}
let vbP=null;
async function view(kind,p){
  try{
    const r=await fetch((kind==='art'?API+'artifact?p=':API+'diff?p=')+encodeURIComponent(p));
    vbP=kind==='art'?p:null;
    document.getElementById('vb-t').textContent=(kind==='art'?'📄 ':'± ')+p;
    const txt=await r.text();
    document.getElementById('vb-c').textContent=txt;
    document.getElementById('vb-c').style.display='block';
    const ta=document.getElementById('vb-t2');ta.style.display='none';ta.value=txt;
    const eb=document.getElementById('vb-e');eb.style.display=kind==='art'?'':'none';eb.textContent='✏️ editar';
    document.getElementById('viewbox').style.display='flex';
    document.getElementById('vbback').style.display='block';
  }catch(e){}
}
document.getElementById('vb-e').addEventListener('click',async()=>{
  const eb=document.getElementById('vb-e'),ta=document.getElementById('vb-t2'),pre=document.getElementById('vb-c');
  if(ta.style.display==='none'){ta.style.display='block';pre.style.display='none';eb.textContent='💾 guardar';return}
  try{await fetch(API+'artifact',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({p:vbP,content:ta.value})});
    pre.textContent=ta.value;ta.style.display='none';pre.style.display='block';eb.textContent='✏️ editar';lastJson='';}catch(e){}
});
async function rollback(phase){
  if(!confirm('↩ Deshacer "'+phase+'": restaura los archivos al estado previo a esa fase (la rama git no se toca). ¿Continuar?'))return;
  try{const r=await fetch(API+'rollback',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phase})});
    const j=await r.json();alert(j.ok?('↩ hecho: '+(j.restored||0)+' restaurado(s), '+(j.removed||0)+' eliminado(s)'):('no se pudo: '+(j.error||'')));}catch(e){}
}
document.addEventListener('click',e=>{const t=e.target.closest&&e.target.closest('[data-rb]');if(t)rollback(t.dataset.rb)});
document.addEventListener('click',e=>{const t=e.target.closest&&e.target.closest('[data-vk]');if(t)view(t.dataset.vk,t.dataset.p)});
// render COMPLETO solo cuando cambian los datos (preserva los <details> abiertos); ligero.
function render(){
  if(!S)return;
  const open=new Set([...document.querySelectorAll('details[data-k][open]')].map(d=>d.dataset.k));
  const v=document.getElementById('v');
  v.textContent=S.pending?'EN PAUSA · REVISIÓN':(S.verdict||'EN CURSO'); v.className='pill '+(S.verdict||'run');
  const ghost=!(S.phases&&S.phases.length)&&!S.current&&!S.pending&&!(S.plan&&S.plan.length)&&!S.request;
  document.getElementById('rproj').textContent=S.project||'run';
  document.getElementById('branch').textContent=S.branch?'⎇ '+S.branch:'';
  const sb=document.getElementById('stopb');
  sb.style.display=S.done?'none':'inline-block';
  if(S.stopRequested&&!S.done){sb.disabled=true;sb.textContent='deteniendo…'}
  document.getElementById('req').textContent=S.request||'—';
  document.getElementById('rcx').textContent=(S.complexity||'—')+(S.request&&S.request.length>90?' · '+S.request.length+' car.':'');
  var rb=document.getElementById('reqbox');if(rb)rb.open=!(S.request&&S.request.length>90);
  document.getElementById('res').textContent=S.resumed?' · run reanudado':'';
  const arts=[];for(const ph of S.phases)for(const f of (ph.files||[]).map(fp))if(f.p.endsWith('.md'))arts.push(f.p);
  const fnd=S.pending&&S.pending.findings;
  document.getElementById('pending').innerHTML=S.pending?
    '<div class="ph now"><div class=row><span class=name>⏸ Decisión del revisor</span>'+
    '<span style="color:var(--tx2)">antes de <b style="color:var(--tx)">'+E(S.pending.before)+'</b> — '+(fnd?'elige qué hallazgos arreglar, o edita/instruye':'lee, edita o instruye; tú decides cuándo seguir')+'</span>'+
    '<span class=right><button class=approve onclick="cont('+(fnd?'true':'')+')">'+(fnd?'🔧 Pedir fix de los marcados':'✓ Aprobar y continuar')+'</button></span></div>'+
    (fnd?'<div class=files style="margin-top:.4rem">'+fnd.map((m,i)=>'<label style="display:block;margin:.15rem 0"><input type=checkbox class=fsel value='+i+' checked> '+E(m)+'</label>').join('')+'</div>':'')+
    '<div class=files style="margin-top:.45rem;display:flex;gap:.5rem;flex-wrap:wrap">'+
    '<input id=pnote placeholder="📣 nota para esta fase (opcional): p.ej. usa signals, no BehaviorSubject" style="flex:1;min-width:16rem;border:1px solid var(--bd);border-radius:5px;padding:.35rem .5rem;font:inherit;font-size:.8rem">'+
    '<input id=phmodel list=mopts placeholder="🎛 modelo solo para esta fase (byok:... / copilot:...)" size=28 style="border:1px solid var(--bd);border-radius:5px;padding:.35rem .5rem;font:inherit;font-size:.8rem">'+
    '<datalist id=mopts>'+((S.modelOptions||[]).map(m=>'<option value="'+E(m)+'">').join(''))+'</datalist>'+
    '</div>'+
    (arts.length?'<div class=files style="margin-top:.4rem">revisar aquí: '+[...new Set(arts)].map(p=>'<code class=lnk data-p="'+E(p)+'" data-vk="art">'+E(p)+'</code>').join(' · ')+'</div>':'')+
    '</div>':'';
  let tin=0,tout=0,nf=0;
  for(const p of S.phases){tin+=p.tokens?.in||0;tout+=p.tokens?.out||0;nf+=p.files?.length||0}
  document.getElementById('cards').innerHTML=
    card('Fases',S.plan&&S.plan.length?S.phases.length+' / '+Math.max(S.plan.length,S.phases.length):String(S.phases.length),'c-f')+
    card('Tokens entrada','↓ '+fmt(tin),'c-ti')+card('Tokens salida','↑ '+fmt(tout),'c-to')+
    card('Archivos',String(nf),'c-a')+((S.approvals&&S.approvals.length)?card('Aprobaciones','🧑‍⚖️ '+S.approvals.length,'c-ap'):'')+card('Tiempo','—','c-t')+
    (S.usage&&S.usage.runDelta>0?card('Coste run (LiteLLM)','+$'+S.usage.runDelta,'c-d'):'')+
    (S.usage?card('LiteLLM (mi key)','$'+S.usage.spend+(S.usage.budget!=null?' / $'+S.usage.budget:''),'c-u'):'')+
    (S.ghUsage?'<div class="card aic"><small>AIC · mi cuenta</small><span>'+S.ghUsage.percentUsed+'%<small style="display:inline;font-size:.62rem;color:var(--tx3);margin-left:.3rem;font-weight:500">'+S.ghUsage.used+'/'+S.ghUsage.entitlement+'</small></span><div class="pbar'+(S.ghUsage.percentUsed>=80?' warn':'')+'"><i style="width:'+Math.min(100,S.ghUsage.percentUsed)+'%"></i></div></div>':'');
  // consumo por modelo como METRICS (no texto): card por modelo con barra de % de salida (lo caro)
  const bm=S.cost&&S.cost.byModel?Object.entries(S.cost.byModel):[];
  const bmOut=bm.reduce((a,x)=>a+(x[1].out||0),0);
  document.getElementById('models').innerHTML=bm.map(([m,b])=>{
    const sh=bmOut?Math.round(100*(b.out||0)/bmOut):0;
    return '<div class=card><small>🤖 '+E(m)+'</small><span>↓'+fmt(b.in)+' ↑'+fmt(b.out)+'</span><div class=pbar><i style="width:'+sh+'%"></i></div><small style="text-transform:none;letter-spacing:0;margin:.3rem 0 0">'+b.phases+' fase(s) · '+sh+'% de la salida</small></div>';
  }).join('');
  document.getElementById('models').style.display=bm.length?'':'none';
  // "Qué pasa por debajo" v2 = LO QUE DICE EL MODELO (crudo, lo que verías sin el plugin) + por qué
  // conductor lo verifica. Sin jerga: el dev junior debe entender el valor de un vistazo.
  const inh=S.phases.filter(p=>p.resumed);
  const ihIn=inh.reduce((a,p)=>a+(p.tokens?.in||0),0),ihOut=inh.reduce((a,p)=>a+(p.tokens?.out||0),0);
  const rawPhases=S.phases.filter(p=>p.hasRaw);
  document.getElementById('underc').innerHTML=
    '<p style="margin:.2rem 0 .7rem;font-size:.82rem;color:var(--tx2);line-height:1.65">Sin conductor, el modelo te suelta este texto y lo aplicas <b>a ciegas</b>. Con conductor lo mismo queda escrito en una <b>spec</b>, lo revisa una <b>segunda pasada</b>, queda <b>trazado a tu repo</b> y <b>reutiliza lo ya hecho</b> para no volver a gastar tokens.</p>'+
    (rawPhases.length?rawPhases.map(p=>'<details class=raw data-rawph="'+E(p.phase)+'"><summary>📤 Lo que dijo el modelo en <b>'+E(p.phase)+'</b></summary><pre class=rawpre>cargando…</pre></details>').join(''):'<p style="font-size:.78rem;color:var(--tx3);margin:0">La salida cruda del modelo aparecerá aquí en cuanto corra una fase.</p>')+
    (inh.length?'<p style="margin:.6rem 0 0;font-size:.79rem;color:var(--ok)">💸 Te has ahorrado tokens: '+inh.length+' fase(s) ya hechas (↓'+fmt(ihIn)+' ↑'+fmt(ihOut)+') <b>no se han vuelto a pagar</b> al reanudar.</p>':'');
  const doneSet=new Set(S.phases.map(p=>p.phase));
  const rows=[];
  for(const p of S.phases){
    const retry=p.attempts>1?'<span class="badge retry">'+p.attempts+' intentos</span>':'';
    const share=tin?Math.round(100*(p.tokens?.in||0)/tin):0;
    const approved=(S.approvals||[]).some(a=>a.phase===p.phase);
    rows.push('<div class="ph '+(p.ok?'done':'fail')+'"><div class=row><span class=name>'+(p.ok?'✅ ':'❌ ')+(PH_ICO[p.phase]||'')+' '+E(p.phase)+'</span><span class=role>'+E(p.role||'')+'</span>'+retry+
      (approved?'<span class=badge title="aprobada por el revisor humano">🧑‍⚖️ aprobada</span>':'')+
      (p.lenses?'<span class=badge title="review multi-lente en paralelo">🔍 '+p.lenses.length+' lentes</span>':'')+
      (p.resumed?'<span class=badge title="heredada de un run anterior (no re-pagada)">⏯ heredada</span>':'')+
      '<span class=right><span class="badge prov-'+(p.provider||'na')+'" title="modelo pedido'+(p.modelReported&&p.modelReported!==p.modelRequested?' · proveedor reportó: '+E(p.modelReported):(p.modelReported?' · confirmado por el proveedor ✓':''))+'">'+mIco(p.model,p.provider)+' '+E(p.model||'modelo de la sesión')+(p.provider?' · '+E(p.provider):'')+(p.modelReported&&p.modelRequested&&p.modelReported!==p.modelRequested?' <span style="color:var(--warn)">⚠ '+E(p.modelReported)+'</span>':(p.modelReported?' ✓':''))+'</span><span>'+secs(p.ms||0)+'</span></span></div>'+
      '<div class=tok><span>entrada <b>'+fmt(p.tokens?.in||0)+'</b></span><span>salida <b>'+fmt(p.tokens?.out||0)+'</b></span>'+(p.tokens?'<span>'+share+'% del run</span>':'')+'</div>'+
      fileBlock('f-'+p.phase,p.files,p.phase==='apply'||p.phase==='fix'?'archivo(s) de código':'artefacto',p.phase==='apply'||p.phase==='fix'?'diff':'art')+
      ((p.phase==='apply'||p.phase==='fix')&&p.ok?'<div class=files><button data-rb="'+E(p.phase)+'" style="border:1px solid var(--bd);background:var(--bg2);border-radius:5px;padding:.15rem .5rem;cursor:pointer;font-size:.74rem">↩ deshacer '+E(p.phase)+'</button></div>':'')+
      (!p.ok&&p.lastError?'<div class=errline>motivo: '+E(p.lastError)+'</div>':'')+
      (p.ok&&p.attempts>1&&p.lastError?'<details class=files data-k="err-'+p.phase+'"><summary>incidencia superada (intento '+(p.attempts-1)+')</summary><div class=errline style="margin-top:.3rem">'+E(p.lastError)+'</div></details>':'')+
      (p.phase==='verify'&&S.verifyExcerpt?'<details class=files data-k="verify"><summary>informe del reviewer</summary><pre style="white-space:pre-wrap;font-size:.78rem;margin:.3rem 0 0">'+E(S.verifyExcerpt)+'</pre></details>':'')+
      '</div>');
  }
  const c=S.current;
  if(!S.done&&c&&!doneSet.has(c.phase)){
    const retry=c.attempt>1?'<span class="badge retry">intento '+c.attempt+'/'+c.maxAttempts+'</span>':'';
    const err=c.lastError?'<div class=errline>último error: '+E(c.lastError)+' → reintentando</div>':'';
    rows.push('<div class="ph now"><div class=row><span class=name>▶ '+(PH_ICO[c.phase]||'')+' '+E(c.phase)+'</span><span class=role>'+E(c.role||'')+'</span>'+retry+
      '<span class=right><span class=badge>'+mIco(c.model,c.provider)+' '+E(c.model||'modelo de la sesión')+'</span><span id=cur-el></span></span></div>'+
      '<div class=bar><div id=cur-bar></div></div>'+
      fileBlock('live',S.live,'tocando ahora','diff')+err+'</div>');
  }
  if(!S.done)for(const p of (S.plan||[]))if(!doneSet.has(p)&&p!==c?.phase)rows.push('<div class=ph><div class=row><span class=name style="color:var(--tx2)">○ '+(PH_ICO[p]||'')+' '+E(p)+'</span><span class=role>pendiente</span></div></div>');
  document.querySelector('.req').style.display=S.request?'':'none';
  document.getElementById('cards').style.display=ghost?'none':'';
  document.getElementById('logsec').style.display=ghost?'none':'';
  document.getElementById('under').style.display=ghost?'none':'';
  if(ghost){document.getElementById('models').style.display='none';}
  if(ghost){
    document.getElementById('v').className='pill G';document.getElementById('v').textContent='sin datos';
    document.getElementById('stopb').style.display='none';
    document.getElementById('list').innerHTML='<div class=ph><div class=row><span class=name>∅ Run vacío o inexistente</span><span style="color:var(--tx2)">este change aún no tiene actividad registrada</span><span class=right><a class=lnk href="/">← todos los runs</a></span></div></div>';
    return;
  }
  document.getElementById('list').innerHTML=rows.join('');
  document.getElementById('logp').textContent=(S.logTail||[]).join('\n')||'(sin eventos aún)';
  for(const d of document.querySelectorAll('details[data-k]')) if(open.has(d.dataset.k)) d.open=true;
  const runName=(API.indexOf('/api/run/')===0?API.split('/')[3]:null);
  const canResume=S.done&&(S.verdict==='ABORTED'||S.verdict==='STOPPED'||S.verdict==='INTERRUMPIDO');
  document.getElementById('actions').innerHTML=S.done&&runName?
    (canResume?'<button class="btn resume" onclick="resumeRun()">⏯ Reanudar este run</button>':'')+
    '<a class="btn report" href="/artifact/'+runName+'/dashboard.html" target=_blank>📊 Informe del run</a>'+
    '<a class="btn aiact" href="'+API+'aiact" target=_blank>🇪🇺 Informe AI Act</a>'
    :'';
  document.getElementById('dash').innerHTML='';
  tickClock();
}
// tick de 1s: SOLO cronómetro y barra (sin reconstruir HTML → no se pliegan los desplegables, CPU ~0)
function tickClock(){
  if(!S)return;
  let tms=0; for(const p of S.phases)tms+=p.ms||0;
  const c=S.current, run=!S.done&&c?Math.max(0,Date.now()-skew-c.startedAt):0;
  const t=document.getElementById('c-t'); if(t)t.textContent=secs(S.done?(S.total_ms||tms):tms+run);
  if(run){const el=document.getElementById('cur-el'); if(el)el.textContent=secs(run);
    const b=document.getElementById('cur-bar'); if(b)b.style.width=Math.min(96,Math.round(run/(c.timeoutMs||600000)*100))+'%';}
}
// ligereza: en pausa de revisión el estado no cambia solo → poll lento (5s); en run activo, 2s.
// El tick de reloj se apaga al terminar. Tras un click, poll inmediato.
let pollTimer=null, ticker=null;
function scheduleRun(ms){clearTimeout(pollTimer);pollTimer=setTimeout(pollRun,ms)}
async function pollRun(){
  if(ROUTE!=="run")return;
  try{
    const txt=await (await fetch(API+'state')).text();
    const s=JSON.parse(txt); skew=Date.now()-s.now;
    const key=JSON.stringify({...s,now:0}); // ignora el reloj; los datos mandan
    S=s; if(key!==lastJson){lastJson=key; render();}
    if(s.done){
      stop=true;clearInterval(ticker);return}
  }catch(e){stop=true;clearInterval(ticker);return}
  scheduleRun(S&&S.pending?5000:2000);
}
async function cont(withSel){
  let payload={};
  if(withSel)payload.selected=[...document.querySelectorAll('.fsel:checked')].map(c=>+c.value);
  const n=document.getElementById('pnote'),m=document.getElementById('phmodel');
  if(n&&n.value.trim())payload.note=n.value.trim();
  if(m&&m.value.trim())payload.model=m.value.trim();
  try{await fetch(API+'continue',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});lastJson='';scheduleRun(150);}catch(e){}
}
async function resumeRun(){try{const r=await fetch(API+'resume',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});if((await r.json()).ok)location.reload();}catch(e){}}
async function stopRun(){if(!confirm('¿Detener el run? Lo hecho se conserva y podrás reanudar con el mismo comando.'))return;try{await fetch(API+'stop',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});lastJson='';scheduleRun(150);}catch(e){}}

let _lastTick=0;
let _rafOn=false;
function rafClock(ts){if(stop||ROUTE!=='run'){_rafOn=false;return;}if(ts-_lastTick>=1000){_lastTick=ts;tickClock();}requestAnimationFrame(rafClock);}
function startClock(){if(!_rafOn){_rafOn=true;requestAnimationFrame(rafClock);}}
ticker=0;



// ── navegación con spinner suave: overlay si la carga tarda >150ms ──




// ═══ VISTA PANEL ═══

async function pollPanel(){
  if(ROUTE!=="panel")return;
  try{
    const d=await (await fetch('/api/changes')).json();
    const _k=JSON.stringify(d,(k2,v2)=>k2==='mtime'?undefined:v2);
    if(_k===lastPanelJson){panelTimer=setTimeout(pollPanel,3000);return;}
    lastPanelJson=_k;
    PROJECTS=d.projects||[];
    const multi=PROJECTS.length>1;
    document.getElementById('proj').textContent=multi?(PROJECTS.length+' proyectos'):(d.project||'');
    document.title='conductor · '+(multi?PROJECTS.length+' proyectos':(d.project||''));
    // selectores de modelo por fase — catálogo DINÁMICO (/api/models): byok real + copilot observado. Nada hardcodeado.
    if(!globalThis._mfilled){
      try{
        const mm=await (await fetch('/api/models')).json();
        const cat=[''].concat((mm.byok||[]).map(m=>'byok:'+m)).concat((mm.copilot||[]).map(m=>'copilot:'+m));
        const opt=v=>'<option value="'+E(v)+'">'+(v||'(conductor.json)')+'</option>';
        for(const r of ['mPlanner','mCoder','mReviewer']){const el=document.getElementById(r);if(el)el.innerHTML=cat.map(opt).join('');}
        const note=document.getElementById('mnote');
        if(note)note.textContent='byok: '+(mm.byokSource||'?')+(mm.byokCreds?'':' (sin credenciales: ejecuta `conductor byok save` desde tu shell BYOK)')+' · copilot: '+(mm.copilotSource||'?');
        globalThis._mfilled=1;
      }catch(e){}
    }
    if(!globalThis._mwired){globalThis._mwired=1;const q=document.getElementById('qcx');if(q)q.addEventListener('change',syncMicro);}
    syncMicro();
    // selector de proyecto del form
    const pw=document.getElementById('qprojwrap'),ps=document.getElementById('qproj');
    if(pw&&ps){pw.style.display=multi?'':'none';
      const cur=ps.value||localStorage.getItem('conductorProj')||'';
      ps.innerHTML=PROJECTS.map(p=>'<option value="'+E(p.id)+'"'+(p.id===cur?' selected':'')+'>'+E(p.name)+(p.openspec?' ✓':' — sin sdd-init')+'</option>').join('');
      ps.title='✓ = el proyecto pasó por /sdd-init (tiene openspec/)';}
    d.changes=PROJECTS.flatMap(p=>{const cs=(p.changes||[]).map(c=>({...c,_pid:p.id,_pname:p.name}));if(multi&&cs.length)cs[0]={...cs[0],_sep:true};return cs;});
    const Ti=d.changes.reduce((a,c)=>a+(c.tokens?.in||0),0),To=d.changes.reduce((a,c)=>a+(c.tokens?.out||0),0),Ng=d.changes.filter(c=>c.verdict==='GREEN').length,Nc=d.changes.filter(c=>c.verdict==='EN CURSO').length;
    const g=d.ghUsage;
    document.getElementById('pmetrics').innerHTML=
      '<div class=card><small>Runs</small><span>'+d.changes.length+'</span></div>'+
      '<div class="card'+(Ng?' ok':'')+'"><small>GREEN</small><span>'+Ng+'</span></div>'+
      (Nc?'<div class="card warn"><small>En curso</small><span>'+Nc+'</span></div>':'')+
      '<div class=card><small>Σ entrada</small><span style="color:var(--accent2)">↓'+fmt(Ti)+'</span></div>'+
      '<div class=card><small>Σ salida</small><span style="color:var(--accent)">↑'+fmt(To)+'</span></div>'+
      (g?'<div class="card aic"><small>AIC · mi cuenta</small><span>'+g.percentUsed+'%<small style="display:inline;font-size:.62rem;color:var(--tx3);margin-left:.3rem;font-weight:500">'+g.used+'/'+g.entitlement+'</small></span><div class="pbar'+(g.percentUsed>=80?' warn':'')+'"><i style="width:'+Math.min(100,g.percentUsed)+'%"></i></div></div>':'');
    document.getElementById('plist').innerHTML=d.changes.length?d.changes.map(c=>{
      const cls=c.verdict==='GREEN'?'GREEN':c.verdict==='EN CURSO'?'CURSO':c.verdict==='—'?'G':'X';
      return (c._sep?'<h2 class=sect style="margin:.9rem 0 .3rem">📁 '+E(c._pname)+'</h2>':'')+'<div class=row data-open="/run/'+encodeURIComponent(c._pid)+'/'+encodeURIComponent(c.name)+'">'+
        '<div class=main><div><span class=nm>'+E(c.name)+'</span> <span class="pill '+cls+'">'+E(c.verdict)+'</span></div>'+
        '<div class=rq title="'+E(c.request||'')+'">'+E(c.request||'')+'</div></div>'+
        '<span class=meta>'+c.phases+' fases · ↓'+fmt(c.tokens.in)+' ↑'+fmt(c.tokens.out)+'</span>'+
        '<div class=acts>'+
        (c.verdict==='EN CURSO'?'<button class="btn sec sm" data-st="'+E(c._pid)+'/'+E(c.name)+'" title="detener" aria-label="detener run" style="color:var(--bad)">■</button>':'')+
        (c.resumable?'<button class="btn resume sm" data-rs="'+E(c._pid)+'/'+E(c.name)+'">⏯ Reanudar</button>':'')+
        (c.hasDashboard?'<a class="btn report sm" href="/artifact/'+encodeURIComponent(c._pid)+'/'+encodeURIComponent(c.name)+'/dashboard.html" target=_blank>📊 Informe</a>':'')+
        '<a class="btn aiact sm" href="/api/run/'+encodeURIComponent(c._pid)+'/'+encodeURIComponent(c.name)+'/aiact" target=_blank>🇪🇺 AI Act</a>'+
        '<a class="btn sm" href="/run/'+encodeURIComponent(c._pid)+'/'+encodeURIComponent(c.name)+'" aria-label="ver run">'+(c.verdict==='EN CURSO'?'👁 En vivo':'Ver run')+' →</a>'+
        '</div></div>';
    }).join(''):'<p style="color:var(--tx2)">sin runs todavía — lanza el primero arriba</p>';
  }catch(e){}
  panelTimer=setTimeout(pollPanel,3000);
}
// modo micro = SOLO corre la fase apply (coder). Planner/Reviewer no existen → no se eligen.
function syncMicro(){
  const cx=(document.getElementById('qcx')||{}).value;
  const micro=cx==='micro';
  const pl=document.getElementById('mwPlanner'),rv=document.getElementById('mwReviewer');
  if(pl)pl.style.display=micro?'none':'';
  if(rv)rv.style.display=micro?'none':'';
  const lc=document.getElementById('mlCoder');if(lc)lc.textContent=micro?'Modelo (única fase)':'Coder';
  const su=document.getElementById('mdsum');if(su)su.textContent=micro?'🤖 Modelo de la tarea (opcional — micro corre 1 sola fase)':'🤖 Modelo por fase (opcional — por defecto usa tu conductor.json)';
}
async function launch(ev){
  ev.preventDefault();
  const ps=document.getElementById('qproj');
  const b={request:document.getElementById('qreq').value,name:document.getElementById('qname').value,complexity:document.getElementById('qcx').value};
  if(ps&&ps.value){b.projectId=ps.value;localStorage.setItem('conductorProj',ps.value);}
  const roles=b.complexity==='micro'?['Coder']:['Planner','Coder','Reviewer']; // micro = solo apply
  const md={};for(const r of roles){const v=(document.getElementById('m'+r)||{}).value;if(v)md[r.toLowerCase()]=v;}
  if(Object.keys(md).length)b.models=md;
  if((document.getElementById('qauto')||{}).checked)b.auto=true;
  const r=await fetch('api/launch',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});
  const jr=await r.json();if(jr.ok&&jr.url)routeTo(jr.url);else if(jr.url)routeTo(jr.url);
  return false;
}
async function resume(key){const i=key.indexOf('/');const b=i>0?{projectId:key.slice(0,i),name:key.slice(i+1)}:{name:key};await fetch('/api/resume',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});}

document.addEventListener('click',e=>{
  const t=e.target.closest&&e.target.closest('[data-rs]');if(t)return resume(t.dataset.rs);
  const row=e.target.closest&&e.target.closest('.row[data-open]');
  if(row&&!e.target.closest('a,button')){routeTo(row.dataset.open);return;}
  const st=e.target.closest&&e.target.closest('[data-st]');
  if(st&&confirm('Detener el run? (lo hecho se conserva; reanudable)'))fetch('/api/run/'+st.dataset.st+'/stop',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
});

// crudo del modelo: carga PEREZOSA al abrir el details (toggle NO burbujea → capture=true). API es la del run actual.
document.addEventListener('toggle',async e=>{
  const d=e.target;if(!d||!d.dataset||!d.dataset.rawph||!d.open||d._loaded)return;d._loaded=1;
  const pre=d.querySelector('.rawpre');if(!pre)return;
  try{const t=await (await fetch(API+'raw?phase='+encodeURIComponent(d.dataset.rawph))).text();pre.textContent=t&&t!=='no encontrado'?t:'(sin salida cruda registrada para esta fase)';}
  catch{pre.textContent='(no se pudo cargar la salida cruda)';}
},true);


// ═══ SHELL: router SPA (pushState) + sidebar + spinner + toggle — una sola página, cero recargas ═══
let ROUTE='panel', panelTimer=0;
const SBK='conductorSbHide';
function applySb(){document.body.classList.toggle('sbhide',localStorage.getItem(SBK)==='1');}
function toggleSb(){localStorage.setItem(SBK,localStorage.getItem(SBK)==='1'?'0':'1');applySb();}
if(localStorage.getItem(SBK)===null&&innerWidth<=820)localStorage.setItem(SBK,'1');
applySb();

function show(view){
  document.getElementById('v-panel').hidden=view!=='panel';
  document.getElementById('v-run').hidden=view!=='run';
  const m=document.querySelector('main');if(m){m.style.animation='none';void m.offsetWidth;m.style.animation='pagein .18s ease both';}
}
function applyRoute(){
  const p=decodeURIComponent(location.pathname);
  if(p.startsWith('/run/')&&p.length>5){ROUTE='run';API='/api/run/'+p.slice(5).replace(/\/$/,'')+'/';show('run');S=null;lastJson='';stop=false;pollRun();startClock();}
  // (la forma /run/<proj~hash>/<change> entra por el mismo camino: la API es el path completo)
  else if(p==='/demo'){ROUTE='run';API='/api/demo/';show('run');S=null;lastJson='';stop=false;pollRun();startClock();}
  else{ROUTE='panel';show('panel');pollPanel();}
  loadSidebar();
}
function routeTo(path){history.pushState({},'',path);applyRoute();}
addEventListener('popstate',applyRoute);
// intercepción de links internos → SPA (sin recarga); _blank y externos siguen normal
document.addEventListener('click',(e)=>{
  const a=e.target.closest&&e.target.closest('a[href]');
  if(!a||a.target==='_blank'||e.ctrlKey||e.metaKey)return;
  const u=new URL(a.href,location.href);
  if(u.origin!==location.origin)return;
  if(u.pathname==='/'||u.pathname.startsWith('/run/')||u.pathname==='/demo'){e.preventDefault();routeTo(u.pathname);}
});

async function loadSidebar(){
  try{
    const d=await (await fetch('/api/changes')).json();
    const _sk=JSON.stringify(d.projects,(k2,v2)=>k2==='mtime'?undefined:v2)+decodeURIComponent(location.pathname);
    if(_sk===lastSbJson)return;
    lastSbJson=_sk;
    PROJECTS=d.projects||[];
    const here=decodeURIComponent(location.pathname);
    const multi=PROJECTS.length>1;
    document.getElementById('sb-list').innerHTML=PROJECTS.map(p=>{
      const runs=(p.changes||[]).map(c=>{
        const dot=c.verdict==='GREEN'?'GREEN':c.verdict==='EN CURSO'?'CURSO':c.verdict==='—'?'':'BAD';
        const href='/run/'+encodeURIComponent(p.id)+'/'+encodeURIComponent(c.name);
        const act=here===href?' act':'';
        return '<a class="sb-run'+act+'" href="'+href+'" title="'+(c.request||'').replace(/"/g,'')+'"><span class="dot '+dot+'"></span>'+c.name+'</a>';
      }).join('');
      return (multi?'<div class=sb-proj>📁 '+E(p.name)+'</div>':'')+(runs||'<span style="font-size:.72rem;color:var(--tx3);padding-left:.5rem">sin runs</span>');
    }).join('')||'<span style="font-size:.75rem;color:var(--tx3)">sin runs aún</span>';
  }catch(e){const sb=document.getElementById('sb');if(sb)sb.style.display='none';}
}
let PROJECTS=[],lastPanelJson='',lastSbJson='';
setInterval(loadSidebar,5000);

// spinner solo para salidas reales de página (informes _blank no lo disparan)
(function(){
  const ov=document.createElement('div');ov.id='navspin';ov.innerHTML='<div class=sp>C</div>';document.body.appendChild(ov);
})();

applyRoute();

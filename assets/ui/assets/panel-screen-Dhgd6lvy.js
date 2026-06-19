import{a as e,c as t,f as n,l as r,m as i,n as a,o,p as s,r as c,t as l,u}from"./index-DPp2yUbL.js";import"./status-pill-Vm9UxVw0.js";var d=class extends r{constructor(...e){super(...e),this.projects=[],this.gh=null,this.usage=null,this.models=null,this.req=``,this.name=``,this.complexity=`medium`,this.auto=!1,this.projId=``,this.mPlanner=``,this.mCoder=``,this.mReviewer=``,this.preset=``,this.busy=!1,this.error=``,this.byokUrl=``,this.byokKey=``,this.byokSaving=!1,this.byokMsg=``,this.est=null,this.q=``,this.hits=[],this.archived=[],this.defProjId=``,this.estTimer=null,this.searchTimer=null,this.liveTimer=null,this.api=new o(`/api/`)}connectedCallback(){super.connectedCallback(),this.load(),this.liveTimer=setInterval(()=>void this.refreshChanges(),5e3)}disconnectedCallback(){super.disconnectedCallback(),this.liveTimer&&clearInterval(this.liveTimer)}async load(){await this.refreshChanges();try{this.archived=(await this.api.archive()).archive??[]}catch{}try{this.models=await this.api.models()}catch{}}async refreshChanges(){try{let e=await this.api.changes();this.projects=e.projects??[],this.gh=e.ghUsage??null,this.usage=e.usage??null,this.projId||=(this.projects.find(t=>t.name===e.project)??this.projects[0])?.id??``,this.defProjId=(this.projects.find(t=>t.name===e.project)??this.projects[0])?.id??this.projId}catch{}}onReq(e){this.req=e.target.value,this.name||=c(this.req.split(/\s+/).slice(0,4).join(` `)),this.scheduleEstimate()}scheduleEstimate(){this.estTimer&&clearTimeout(this.estTimer),this.estTimer=setTimeout(()=>void this.fetchEstimate(),350)}async fetchEstimate(){if(!this.req.trim()){this.est=null;return}try{let e=await this.api.estimate(this.complexity,this.req);this.est={total:e.total,rows:e.phases,saved:e.noRescanSaved}}catch{}}onSearch(e){this.q=e.target.value,this.searchTimer&&clearTimeout(this.searchTimer),this.searchTimer=setTimeout(()=>void this.runSearch(),280)}async runSearch(){if(!this.q.trim()){this.hits=[];return}try{this.hits=(await this.api.search(this.q)).hits??[]}catch{}}async launch(e){if(e.preventDefault(),!this.req.trim()||!this.name){this.error=`Indica la petición y el nombre del cambio`;return}this.busy=!0,this.error=``;let n={};this.mPlanner&&(n.planner=this.mPlanner),this.mCoder&&(n.coder=this.mCoder),this.mReviewer&&(n.reviewer=this.mReviewer);try{let e=await this.api.launch({request:this.req,name:c(this.name),complexity:this.complexity,auto:this.auto,projectId:this.projId||void 0,models:Object.keys(n).length?n:void 0});if(e.ok&&e.url){t.go(e.url);return}this.error=e.error??`no se pudo lanzar`}catch(e){this.error=e.message}finally{this.busy=!1}}async resume(e,n){let r=await this.api.resumeNamed(n.name,e.id);r.ok&&r.url&&t.go(r.url)}metrics(){let t=this.projects.flatMap(e=>e.changes??[]);return{total:t.length,green:t.filter(t=>e(t.verdict)===`GREEN`).length,curso:t.filter(t=>e(t.verdict)===`CURSO`).length,tin:t.reduce((e,t)=>e+(t.tokens?.in??0),0),tout:t.reduce((e,t)=>e+(t.tokens?.out??0),0)}}sddProjects(){return this.projects.filter(e=>e.openspec)}modelOptions(){let e=this.models;return e?[...e.byokCreds?e.byok.map(e=>`byok:`+e):[],...e.copilot.map(e=>`copilot:`+e)]:[]}tierRank(e){return e===`premium`?3:e===`economy`?1:2}applyPreset(e){if(this.preset=e,e===`clear`){this.mPlanner=``,this.mCoder=``,this.mReviewer=``;return}let t=this.models;if(!t)return;let n=t.tiers??{},r=[...t.copilot],i=r.length?`copilot:`+[...r].sort((e,t)=>this.tierRank(n[e])-this.tierRank(n[t]))[0]:``,a=r.length?`copilot:`+[...r].sort((e,t)=>this.tierRank(n[t])-this.tierRank(n[e]))[0]:``,o=``,s=``,c=``;if(e===`quality`)o=s=c=a;else{let e=r.filter(e=>n[e]!==`premium`),a=e.length?e:r,l=a.length?`copilot:`+[...a].sort((e,t)=>this.tierRank(n[t])-this.tierRank(n[e]))[0]:``,u=t.byok.length?`byok:`+[...t.byok].sort((e,t)=>this.tierRank(n[e])-this.tierRank(n[t]))[0]:``;s=t.byokCreds&&t.byok.length>0?u:i,o=i,c=l||i}let l=this.modelOptions(),u=e=>e&&l.includes(e)?e:``;this.mPlanner=u(o),this.mCoder=u(s),this.mReviewer=u(c)}async byokSave(e){e.preventDefault();let t=(this.byokUrl||this.models?.byokUrl||``).trim(),n=this.byokKey.trim();if(!(!t||!n)){this.byokSaving=!0,this.byokMsg=``;try{let e=await(await fetch(`/api/byok/save`,{method:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify({url:t,key:n})})).json();if(e.ok){this.byokMsg=`✓ Guardado`,this.byokKey=``,this.models=null;try{this.models=await this.api.models()}catch{}}else this.byokMsg=e.error??`Error al guardar`}catch(e){let t=e;this.byokMsg=t instanceof TypeError?`No se pudo conectar con el servidor local. Comprueba que la aplicación está en ejecución.`:String(t.message)}finally{this.byokSaving=!1}}}byokHost(){let e=this.models?.byokUrl||this.byokUrl;try{return new URL(e).host}catch{return e||`LiteLLM`}}byokForm(){let e=!!this.models?.byokCreds,t=this.byokMsg?i`<div class="inst-msg ${this.byokMsg.startsWith(`✓`)?`ok`:`bad`}" role="status" aria-live="polite">${this.byokMsg.replace(/^✓\s*/,``)}</div>`:s;return e?i`
        <details class="inst-panel" style="margin-top:.6rem">
          <summary class="inst-head">
            <span class="inst-led on-ok" aria-hidden="true"></span>
            <span class="inst-title">qwen · LiteLLM</span>
            <span class="inst-status ok">Conectado</span>
            <span class="inst-chev" aria-hidden="true"></span>
          </summary>
          <div class="inst-body">
            <dl class="readout">
              <div class="ro-row"><dt>Proveedor</dt><dd>${this.byokHost()}</dd></div>
              <div class="ro-row"><dt>Credencial</dt><dd>Guardada · cifrada localmente</dd></div>
            </dl>
            <p class="inst-note">La clave se mantiene entre sesiones. Cámbiala solo si caduca.</p>
            <form class="frow" style="align-items:end" @submit=${e=>void this.byokSave(e)}>
              <label class="fl" style="flex:2;min-width:12rem">Nueva API Key<input type="password" .value=${this.byokKey} @input=${e=>{this.byokKey=e.target.value}} placeholder="sk-… (solo si caducó)" autocomplete="off"></label>
              <button class="btn sm sec" ?disabled=${this.byokSaving||!this.byokKey.trim()} style="align-self:end">${this.byokSaving?`…`:`Actualizar clave`}</button>
            </form>
            ${t}
          </div>
        </details>`:i`
      <details class="inst-panel inst-prompt" style="margin-top:.6rem" open>
        <summary class="inst-head">
          <span class="inst-led on-warn" aria-hidden="true"></span>
          <span class="inst-title">Conectar qwen · LiteLLM</span>
          <span class="inst-status warn">Configuración única</span>
          <span class="inst-chev" aria-hidden="true"></span>
        </summary>
        <div class="inst-body">
          <p class="inst-note">Conecta tu proxy LiteLLM una vez para usar qwen (más barato) en las fases que elijas. La clave se guarda cifrada en tu equipo.</p>
          <form class="frow" style="align-items:end" @submit=${e=>void this.byokSave(e)}>
            <label class="fl" style="flex:2;min-width:12rem">URL LiteLLM<input type="url" .value=${this.byokUrl} @input=${e=>{this.byokUrl=e.target.value}} placeholder="https://…/v1" required></label>
            <label class="fl" style="flex:2;min-width:10rem">API Key<input type="password" .value=${this.byokKey} @input=${e=>{this.byokKey=e.target.value}} placeholder="sk-…" autocomplete="off" required></label>
            <button class="btn sm" ?disabled=${this.byokSaving} style="align-self:end">${this.byokSaving?`…`:`Guardar`}</button>
          </form>
          ${t}
        </div>
      </details>`}render(){let t=this.metrics(),n=this.modelOptions(),r=this.projects.flatMap(t=>(t.changes??[]).filter(t=>e(t.verdict)===`CURSO`).map(e=>({p:t,c:e}))),o=this.projects.flatMap(t=>(t.changes??[]).filter(t=>e(t.verdict)!==`CURSO`).map(e=>({p:t,c:e}))),c=i`
      <form class="launch-form" @submit=${e=>void this.launch(e)}>
        <label class="fl">Qué quieres construir
          <textarea rows="3" placeholder="Describe el cambio en una frase o pega una especificación completa" .value=${this.req} @input=${e=>this.onReq(e)} required></textarea>
        </label>
        <div class="frow">
          ${this.sddProjects().length>1?i`<label class="fl">Proyecto<select .value=${this.projId} @change=${e=>{this.projId=e.target.value}}>
            ${this.sddProjects().map(e=>i`<option value=${e.id}>${e.name}</option>`)}
          </select></label>`:s}
          <label class="fl" style="flex:1;min-width:10rem" title="Identificador del cambio (kebab): el id de la carpeta openspec/changes. NO es la spec — los requisitos los escribe el Planner. Auto-sugerido; edítalo si quieres.">Nombre del cambio<input .value=${this.name} @input=${e=>{this.name=e.target.value}} placeholder="p.ej. cupon-descuento" pattern="[a-z0-9-]+" required></label>
          <label class="fl" title="rápido = 1 fase de código sin spec (gancho para tareas pequeñas: typos, ajustes). simple/medium/complex = pipeline SDD completo (spec→…→verify).">Complejidad<select .value=${this.complexity} @change=${e=>{this.complexity=e.target.value,this.scheduleEstimate()}}>
            <option value="micro">Fix · sin spec</option><option value="simple">Simple · SDD</option><option value="medium">Media · SDD</option><option value="complex">Compleja · SDD</option>
          </select></label>
          <label class="fl" title="Sin pausas de revisión: el pipeline corre de principio a fin sin pedirte aprobar cada fase (el experto suele quererlo OFF)">Auto-aprobar<label class="switch"><input type="checkbox" aria-label="Auto-aprobar: ejecutar sin pausas de revisión" .checked=${this.auto} @change=${e=>{this.auto=e.target.checked}}><span></span></label></label>
          <button class="btn" ?disabled=${this.busy} style="align-self:end">${this.busy?`…`:`Lanzar run`}</button>
        </div>
        <div class="launch-meta">
          ${this.launchModelSummary()}
          ${this.est?i`<details class="lm-estd"><summary class="lm-est">≈ ${a(this.est.total)} tokens · ${this.est.rows.length} fases <span class="muted">· preflight, sin API</span></summary>
            <table class="est-tab">${this.est.rows.map(e=>i`<tr><td>${e.phase}</td><td>↓ ${a(e.estIn)}</td><td>↑ ${a(e.estOut)}</td></tr>`)}</table>
            ${this.est.saved>0?i`<p class="est-saved">Ahorro estimado de ${a(this.est.saved)} tokens de entrada <span class="muted">(el planner no relee el repositorio)</span></p>`:s}
          </details>`:s}
        </div>
        ${n.length?i`
        <details class="inst-panel" style="margin-top:.6rem">
          <summary class="inst-head">
            <span class="inst-led" aria-hidden="true"></span>
            <span class="inst-title">Modelo por fase</span>
            <span class="inst-sub">${this.preset===`cost`?`Optimizar coste`:this.preset===`quality`?`Máxima calidad`:`Recomendado`}</span>
            <span class="inst-chev" aria-hidden="true"></span>
          </summary>
          <div class="inst-body">
            <div class="seg-group" role="radiogroup" aria-label="Preajuste de modelo por fase">
              <button type="button" role="radio" aria-checked=${this.preset===`cost`} class="seg cost ${this.preset===`cost`?`on`:``}" @click=${()=>this.applyPreset(`cost`)} title="Coder → qwen (más barato, vía LiteLLM) · Reviewer → Copilot capaz · Planner → Copilot económico"><span class="seg-led" aria-hidden="true"></span>Optimizar coste</button>
              <button type="button" role="radio" aria-checked=${this.preset===`quality`} class="seg ${this.preset===`quality`?`on`:``}" @click=${()=>this.applyPreset(`quality`)} title="Todas las fases con el Copilot más capaz"><span class="seg-led" aria-hidden="true"></span>Máxima calidad</button>
              <button type="button" role="radio" aria-checked=${this.preset===`clear`||this.preset===``} class="seg ${this.preset===`clear`||this.preset===``?`on`:``}" @click=${()=>this.applyPreset(`clear`)} title="Cada fase usa el modelo recomendado por conductor"><span class="seg-led" aria-hidden="true"></span>Recomendado</button>
            </div>
            <div class="phase-grid">
              ${this.roleSelect(`Planner`,this.mPlanner,e=>{this.mPlanner=e,this.preset=``})}
              ${this.roleSelect(`Coder`,this.mCoder,e=>{this.mCoder=e,this.preset=``})}
              ${this.roleSelect(`Reviewer`,this.mReviewer,e=>{this.mReviewer=e,this.preset=``})}
            </div>
            ${this.mixNote()}
          </div>
        </details>`:s}
        ${this.byokForm()}
      </form>
      ${this.error?i`<p style="color:var(--bad)">${this.error}</p>`:s}
    `;return i`
      <div class="apphdr"><h1>Dashboard</h1></div>
      <p class="muted" style="margin:-.9rem 0 1.3rem;font-size:.82rem">${this.projects.length} proyecto${this.projects.length===1?``:`s`} · ${t.total} run${t.total===1?``:`s`}</p>
      <div class="cards">
        <div class="card"><small>Runs</small><span>${t.total}</span></div>
        <div class="card ok"><small>Green</small><span>${t.green}</span></div>
        ${t.curso>0?i`<div class="card warn"><small>En curso</small><span>${t.curso}</span></div>`:s}
        <div class="card"><small>Tokens entrada ↓</small><span>${a(t.tin)}</span></div>
        <div class="card"><small>Tokens salida ↑</small><span>${a(t.tout)}</span></div>
        ${this.gh?i`<div class="card aic"><small>AI Credits</small><span>${this.gh.used}/${this.gh.entitlement}</span><div class="pbar ${this.gh.percentUsed>80?`warn`:``}"><i style="width:${Math.min(100,this.gh.percentUsed)}%"></i></div></div>`:s}
        ${this.usage?i`<div class="card"><small>Uso total qwen</small><span>$${this.usage.spend.toFixed(2)}${this.usage.budget?i` <span class="muted" style="font-size:.8rem;font-weight:500">/ $${this.usage.budget.toFixed(0)}</span>`:s}</span>${this.usage.budget?i`<div class="pbar ${this.usage.spend/this.usage.budget>.8?`warn`:``}"><i style="width:${Math.min(100,this.usage.spend/this.usage.budget*100)}%"></i></div>`:s}</div>`:s}
      </div>

      ${r.length>0?i`
        <h2 class="sect">En curso</h2>
        ${r.map(({p:e,c:t})=>this.runRow(e,t))}
        <details class="launch-fold" style="margin: 1.1rem 0 .3rem">
          <summary>Nueva funcionalidad</summary>
          ${c}
        </details>
      `:c}

      ${!this.q.trim()&&o.length>0?i`
        <div class="sectrow">
          <h2 class="sect">Historial</h2>
          <input class="search" type="search" placeholder="Buscar" .value=${this.q} @input=${e=>this.onSearch(e)} aria-label="buscar runs y cambios archivados">
        </div>
        ${o.map(({p:e,c:t})=>this.runRow(e,t))}
      `:s}

      ${this.q.trim()?i`
        <div class="sectrow" style="margin-top:.8rem">
          <h2 class="sect">Búsqueda</h2>
          <input class="search" type="search" placeholder="Buscar" .value=${this.q} @input=${e=>this.onSearch(e)} aria-label="buscar runs y cambios archivados">
        </div>
        <p class="muted" style="font-size:.78rem;margin:.2rem 0 .6rem">${this.hits.length} resultado${this.hits.length===1?``:`s`} para "${this.q}"</p>
        ${this.hits.map(e=>this.hitRow(e))}
      `:s}

      ${t.total===0?i`<p class="muted" style="margin-top:.5rem">Aún no hay runs. Lanza el primero arriba.</p>`:s}

      ${this.archived.length?i`
        <details class="arch">
          <summary>📦 Archivados <span class="muted">· ${this.archived.length}</span></summary>
          ${this.archived.map(e=>i`
            <div class="arch-row">
              <status-pill .verdict=${e.verdict}></status-pill>
              <span class="nm">${e.name}</span>
              ${e.project?i`<span class="proj">📁 ${e.project}</span>`:s}
              <span class="muted">${e.date??``} · ${e.phases} fases · ${e.request}</span>
            </div>`)}
        </details>`:s}
    `}hitRow(e){let t=i`<status-pill .verdict=${e.verdict}></status-pill><span class="nm">${e.name}</span>${e.archived?i`<span class="tag">📦</span>`:s}${e.project?i`<span class="proj">📁 ${e.project}</span>`:s}<span class="muted snip">…${e.snippet}…</span>`;return i`<div class="hit-row">${e.archived?t:i`<a class="hit-main" href="/run/${e.projectId??this.defProjId}/${e.name}">${t}</a>`}</div>`}launchModelSummary(){let e=e=>e.replace(/^(byok|copilot):/,``),t=[this.mPlanner,this.mCoder,this.mReviewer];return t.some(Boolean)?i`<span class="lm-model" title="modelo elegido por fase — cámbialo en «Modelo por fase»">Modelo: <b>${t.every(e=>e===t[0])?e(t[0]):`planner ${e(this.mPlanner)||`—`} · coder ${e(this.mCoder)||`—`} · reviewer ${e(this.mReviewer)||`—`}`}</b></span>`:s}mixNote(){let e=[...new Set([this.mPlanner,this.mCoder,this.mReviewer].map(e=>e?e.startsWith(`byok:`)?`qwen`:e.startsWith(`copilot:`)?`Copilot`:`sesión`:``).filter(Boolean))];return e.length<2?s:i`<div class="muted" style="font-size:.72rem;margin-top:.5rem">proveedores: ${e.join(` + `)}</div>`}roleSelect(e,t,n){let r=this.models,a=r?.copilot??[],o=r?.byok??[],c=!!r?.byokCreds,l=e=>e.startsWith(`claude`)?`Claude`:e.startsWith(`gpt`)?`GPT`:e.startsWith(`gemini`)?`Gemini`:`Otros`;return i`<label class="fl" style="flex:1">${e}<select .value=${t} @change=${e=>n(e.target.value)}>
      <option value="">Recomendado (conductor elige)</option>
      ${[`Claude`,`GPT`,`Gemini`,`Otros`].map(e=>[e,a.filter(t=>l(t)===e).sort((e,t)=>t.localeCompare(e))]).filter(([,e])=>e.length).map(([e,t])=>i`<optgroup label="Copilot · ${e}">${t.map(e=>i`<option value="copilot:${e}">${e}</option>`)}</optgroup>`)}
      ${c&&o.length?i`<optgroup label="qwen · LiteLLM">${o.map(e=>i`<option value="byok:${e}">${e}</option>`)}</optgroup>`:s}
    </select></label>`}runRow(t,n){return i`
      <div class="run-row ${e(n.verdict)===`CURSO`?`run-active`:``}">
        <div class="run-l">
          <a class="main" href="/run/${t.id}/${n.name}">
            <span class="nm">${n.name} <status-pill .verdict=${n.verdict}></status-pill></span>
            <span class="rq">${n.request}</span>
            <span class="proj">📁 ${t.name}</span>
          </a>
          <div class="run-foot">
            <span class="meta">${n.phases} fases · ↓ ${a(n.tokens?.in)} entrada · ↑ ${a(n.tokens?.out)} salida</span>
            ${n.resumable?i`<button class="btn sm resume" @click=${()=>void this.resume(t,n)} aria-label="reanudar ${n.name}">⏯ Reanudar</button>`:s}
            ${n.hasDashboard?i`<a class="btn sm dash" href="/artifact/${t.id}/${n.name}/dashboard.html" target="_blank" aria-label="dashboard de ${n.name}">📊 Dashboard</a>`:s}
            ${n.phases>0?i`<a class="btn sm aiact" href="/api/run/${t.id}/${n.name}/aiact" target="_blank" aria-label="AI Act de ${n.name}">🛡 AI Act</a>`:s}
          </div>
        </div>
        <a class="run-open" href="/run/${t.id}/${n.name}" tabindex="-1" aria-hidden="true"><span class="chev" aria-hidden="true"></span></a>
      </div>`}};l([u()],d.prototype,`projects`,void 0),l([u()],d.prototype,`gh`,void 0),l([u()],d.prototype,`usage`,void 0),l([u()],d.prototype,`models`,void 0),l([u()],d.prototype,`req`,void 0),l([u()],d.prototype,`name`,void 0),l([u()],d.prototype,`complexity`,void 0),l([u()],d.prototype,`auto`,void 0),l([u()],d.prototype,`projId`,void 0),l([u()],d.prototype,`mPlanner`,void 0),l([u()],d.prototype,`mCoder`,void 0),l([u()],d.prototype,`mReviewer`,void 0),l([u()],d.prototype,`preset`,void 0),l([u()],d.prototype,`busy`,void 0),l([u()],d.prototype,`error`,void 0),l([u()],d.prototype,`byokUrl`,void 0),l([u()],d.prototype,`byokKey`,void 0),l([u()],d.prototype,`byokSaving`,void 0),l([u()],d.prototype,`byokMsg`,void 0),l([u()],d.prototype,`est`,void 0),l([u()],d.prototype,`q`,void 0),l([u()],d.prototype,`hits`,void 0),l([u()],d.prototype,`archived`,void 0),d=l([n(`panel-screen`)],d);export{d as PanelScreen};
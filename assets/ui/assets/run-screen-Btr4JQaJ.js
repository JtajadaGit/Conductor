import{a as e,d as t,f as n,h as r,i,l as a,n as o,o as s,p as c,s as l,t as u,u as d}from"./index-BbJHMIIU.js";import"./status-pill-BS_o-L20.js";var f=class{constructor(e,t,n){this.base=e,this.onState=t,this.onError=n,this.timer=null,this.abort=null,this.lastHash=``,this.stopped=!0}start(){this.stopped=!1,this.lastHash=``,this.tick()}stop(){this.stopped=!0,this.timer!=null&&(clearTimeout(this.timer),this.timer=null),this.abort&&=(this.abort.abort(),null)}schedule(e){this.stopped||(this.timer=setTimeout(()=>void this.tick(),e))}async tick(){if(!this.stopped){this.abort=new AbortController;try{let e=await(await fetch(this.base+`state`,{signal:this.abort.signal})).json();if(this.stopped)return;if(!e||typeof e!=`object`||Array.isArray(e)){this.schedule(3e3);return}let t={...e,phases:Array.isArray(e.phases)?e.phases:[]},n=this.hashOf(t);if(n!==this.lastHash&&(this.lastHash=n,this.onState(t)),t.done){this.stop();return}this.schedule(t.pending?5e3:2e3)}catch(e){if(this.stopped)return;e.name!==`AbortError`&&this.onError?.(e),this.schedule(3e3)}}}hashOf(e){let{now:t,...n}=e;return JSON.stringify(n)}},p={explore:`🔍`,propose:`📝`,clarify:`❓`,spec:`📐`,design:`🧩`,tasks:`🗂️`,apply:`🛠️`,test:`🧪`,fix:`🔧`,verify:`🛡️`};function m(e){return p[e]??`•`}function h(e,t){let n=(e??``).toLowerCase();return t===`byok`||/qwen|deepseek/.test(n)?`🔑`:/opus/.test(n)?`🧠`:/sonnet/.test(n)?`🎼`:/haiku/.test(n)?`⚡`:/gpt/.test(n)?`🤖`:`💼`}var g=class extends a{constructor(...e){super(...e),this.apiBase=`/api/`,this.phase=``,this.text=``,this.loaded=!1}async load(){if(!this.loaded){this.loaded=!0,this.text=`…`;try{let e=await(await fetch(this.apiBase+`raw?phase=`+encodeURIComponent(this.phase))).text();this.text=e&&e!==`no encontrado`?e.trim():`No se registró salida del modelo para esta fase.`}catch{this.text=`No se pudo cargar la salida del modelo.`}}}render(){return r`<details class="raw" @toggle=${e=>{e.target.open&&this.load()}}>
      <summary>Salida sin procesar del modelo</summary>
      <pre class="rawpre">${(this.text||`…`).trim()||`…`}</pre>
    </details>`}};u([t()],g.prototype,`apiBase`,void 0),u([t()],g.prototype,`phase`,void 0),u([d()],g.prototype,`text`,void 0),u([d()],g.prototype,`loaded`,void 0),g=u([n(`raw-output`)],g);var _=class extends a{constructor(...e){super(...e),this.cost=null}render(){let e=this.cost?.byModel;if(!e||!Object.keys(e).length)return c;let t=Object.values(e).reduce((e,t)=>e+(t.in||0),0)||1;return r`<h2 class="sect">Coste por modelo</h2>
      <div class="mb-list">
        ${Object.entries(e).map(([e,n])=>{let i=Math.max(0,Math.min(100,Math.round((Number(n.in)||0)/t*100)));return r`<div class="mb-row">
            <span class="mb-name" title=${e}>${e}</span>
            <span class="mb-track"><i style="width:${i}%"></i></span>
            <span class="mb-meta">${i}% · ↓${o(n.in)} ↑${o(n.out)} · ${n.phases} fase(s)</span>
          </div>`})}
      </div>`}};u([t({attribute:!1})],_.prototype,`cost`,void 0),_=u([n(`model-breakdown`)],_);var v=class extends a{constructor(...e){super(...e),this.apiBase=`/api/`,this.change=``,this.projId=``,this.phaseId=``,this.s=null,this.err=``,this.selected=new Set,this.note=``,this.hotModel=``,this.models=null,this.files=null,this.filesSig=``,this.api=new s(`/api/`),this.poller=null,this.activeBase=``}updated(e){this.apiBase&&this.apiBase!==this.activeBase&&(this.activeBase=this.apiBase,this.restart())}disconnectedCallback(){super.disconnectedCallback(),this.poller?.stop()}restart(){this.poller?.stop(),this.s=null,this.err=``,this.files=null,this.filesSig=``,this.api=new s(this.apiBase),this.poller=new f(this.apiBase,e=>{this.s=e,this.maybeFetchFiles(e)},e=>{this.err=e.message}),this.poller.start(),new s(`/api/`).models().then(e=>{this.models=e}).catch(()=>{})}async maybeFetchFiles(e){let t=(e.verdict??``)+`|`+e.phases.filter(e=>e.ok).length;if(t!==this.filesSig)try{this.files=await this.api.runFiles(),this.filesSig=t}catch{}}hotModelSelect(){let e=this.models,t=e?.copilot??[],n=e?.byok??[],i=!!e?.byokCreds;return r`<label class="fl">Cambiar modelo<select .value=${this.hotModel} @change=${e=>{this.hotModel=e.target.value}}>
      <option value="">Mantener el modelo de esta fase</option>
      ${t.length?r`<optgroup label="Copilot">${t.map(e=>r`<option value="copilot:${e}">${e}</option>`)}</optgroup>`:c}
      ${i&&n.length?r`<optgroup label="qwen · LiteLLM">${n.map(e=>r`<option value="byok:${e}">${e}</option>`)}</optgroup>`:c}
    </select></label>`}async approve(e){await this.api.continue({selected:e?[...this.selected]:void 0,note:this.note||void 0,model:this.hotModel||void 0}),this.note=``,this.hotModel=``,this.selected=new Set}toggleSel(e,t){let n=new Set(this.selected);t?n.add(e):n.delete(e),this.selected=n}async rollback(e){confirm(`¿Deshacer "${e}"? Se restaurarán los archivos al estado previo a esta fase. La rama de git no se modifica.`)&&await this.api.rollback(e)}viewDiff(e){document.dispatchEvent(new CustomEvent(`cdr-view`,{detail:{apiBase:this.apiBase,kind:`diff`,path:e}}))}viewArtifact(e){document.dispatchEvent(new CustomEvent(`cdr-view`,{detail:{apiBase:this.apiBase,kind:`art`,path:e}}))}runPath(){return location.pathname.replace(/\/+$/,``)}dashboardHref(){return this.projId?`/artifact/${this.projId}/${this.change}/dashboard.html`:`/artifact/${this.change}/dashboard.html`}sessionHref(){return this.projId?`/session/${this.projId}/${this.change}`:`/session/${this.change}`}sign(e){return e===`create`?`+`:e===`delete`?`−`:`±`}render(){if(this.err&&!this.s)return r`<p class="errline" role="alert">Error: ${this.err}</p>`;let t=this.s;return t?r`
      <div class="apphdr">
        <h1 class="trunc">${this.change||t.project||`run`}</h1>
        <span role="status" aria-live="polite"><status-pill .verdict=${t.pending?`EN PAUSA`:t.verdict??`EN CURSO`}></status-pill></span>
      </div>
      <p class="subhead">${t.project||`—`}${t.branch?r` · ${t.branch}`:``}</p>
      <div class="actbar">
        <a class="btn sm sec" href=${this.sessionHref()}>Ver sesión</a>
        ${t.done&&e(t.verdict)!==`GREEN`?r`<button class="btn sm sec resume" @click=${()=>void this.api.resume()}>↻ Reanudar</button>`:c}
        ${t.hasDashboard?r`<a class="btn sm sec dash" href=${this.dashboardHref()} target="_blank">Informe</a>`:c}
        <a class="btn sm sec aiact" href=${this.apiBase+`aiact`} target="_blank">AI Act</a>
        ${t.done?c:r`<button class="btn sm stop" ?disabled=${t.stopRequested} @click=${()=>void this.api.stop()}>${t.stopRequested?`Deteniendo…`:`■ Detener`}</button>`}
      </div>
      ${t.tests?.ran?r`<div class="muted" style="margin:.1rem 0 .9rem;font-size:.82rem">Pruebas del proyecto (antes de verify): ${t.tests.passed?r`<span style="color:var(--ok);font-weight:600">✓ pasaron</span>`:r`<span style="color:var(--warn);font-weight:600">✗ fallaron</span>`} <code style="font-size:.85em">${t.tests.cmds.join(` · `)}</code>${!t.tests.passed&&t.tests.failed.length?r` <span class="muted">— falló: ${t.tests.failed.join(`, `)}</span>`:c}</div>`:c}
      ${this.requestBox(t)}
      ${this.phaseId?this.phaseDetail(t):c}
      ${t.pending?this.pendingCard(t.pending):c}
      ${this.cards(t)}
      ${this.changesSection()}
      ${this.pipeline(t)}
      ${t.cost?r`<model-breakdown .cost=${t.cost}></model-breakdown>`:c}
      ${this.logBox(t)}
    `:l(`Cargando run`)}requestBox(e){return r`<details class="req" ?open=${!(e.request&&e.request.length>90)}>
      <summary class="req-sum"><span class="req-lbl">Prompt</span><span class="req-badge">${e.complexity}${e.resumed?` · reanudado`:``}</span></summary>
      <p class="req-body">${e.request}</p>
    </details>`}phaseDetail(e){let t=e.phases.find(e=>e.phase===this.phaseId);return t?r`<div class="ph">
      <div class="row">
        <span class="name">${m(t.phase)} Detalle: ${t.phase}</span>
        <span class="role">${t.role}</span>
        <span class="right">${i(t.ms)} · ↓${o(t.tokens?.in)} ↑${o(t.tokens?.out)}</span>
      </div>
      ${this.fileList(t.files)}
      ${t.hasRaw?r`<raw-output .apiBase=${this.apiBase} .phase=${t.phase}></raw-output>`:c}
      <div style="margin-top:var(--sp-2)"><a class="btn sm sec" href=${this.runPath()}>← volver</a></div>
    </div>`:c}pendingCard(e){let t=(e.findings??[]).map(e=>typeof e==`string`?{message:e}:e);return r`<section class="decision">
      <header class="decision-head">
        <span class="decision-led" aria-hidden="true"></span>
        <div class="decision-titles">
          <h2 class="decision-title">Decisión del revisor</h2>
          <span class="decision-sub" role="status" aria-live="polite">Antes de <b>${e.before}</b> · ${t.length?`selecciona los hallazgos a corregir o ajusta la fase`:`revisa y aprueba para continuar`}</span>
        </div>
      </header>
      <div class="decision-body">
        ${t.length?r`<ul class="decision-findings">${t.map((e,t)=>r`
          <li>
            <label><input type="checkbox" .checked=${this.selected.has(t)} @change=${e=>this.toggleSel(t,e.target.checked)}>
              <span class="fnd">${e.severity?r`<span class="sev ${e.severity===`error`?`error`:`aviso`}">${e.severity===`error`?`error`:`aviso`}</span>`:c}${e.message}</span></label>
            ${e.file?/\.(md|txt)$/.test(e.file)?r`<button type="button" class="lnk fnd-file" title="ver ${e.file}" @click=${()=>this.viewArtifact(e.file)}>${e.file}</button>`:r`<code class="fnd-file">${e.file}</code>`:c}
          </li>`)}</ul>`:c}
        <div class="pend-controls">
          <label class="fl" style="flex:1;min-width:14rem">Nota (opcional)<textarea class="pend-note" rows="2" .value=${this.note} @input=${e=>{this.note=e.target.value}} placeholder="Instrucción para esta fase (opcional)"></textarea></label>
          ${this.hotModelSelect()}
        </div>
        <button class="approve" @click=${()=>void this.approve(t.length>0)}>${t.length?`Corregir los hallazgos seleccionados`:`Aprobar y continuar`}</button>
      </div>
    </section>`}cards(e){let t=e.phases.filter(e=>e.ok).length,n=e.plan?.length||e.phases.length,a=e.phases.reduce((e,t)=>e+(t.tokens?.in??0),0),s=e.phases.reduce((e,t)=>e+(t.tokens?.out??0),0),l=e.phases.reduce((e,t)=>e+(t.files?.length??0),0),u=e.ghUsage;return r`<div class="cards">
      <div class="card"><small>Fases</small><span>${t} / ${n}</span></div>
      <div class="card"><small>Tokens entrada</small><span>↓ ${o(a)}</span></div>
      <div class="card"><small>Tokens salida</small><span>↑ ${o(s)}</span></div>
      <div class="card"><small>Ficheros</small><span>${l}</span></div>
      <div class="card"><small>Tiempo</small><span>${i(e.total_ms??(e.current?e.now-e.current.startedAt:null))}</span></div>
      ${e.usage?r`<div class="card"><small>qwen · LiteLLM</small><span>$${e.usage.spend.toFixed(2)}${e.usage.budget?r` / $${e.usage.budget.toFixed(0)}`:c}</span>${e.usage.budget?r`<div class="pbar ${e.usage.spend/e.usage.budget>.8?`warn`:``}"><i style="width:${Math.min(100,e.usage.spend/e.usage.budget*100)}%"></i></div>`:c}</div>`:c}
      ${u?r`<div class="card aic"><small>AI Credits</small><span>${u.used}/${u.entitlement}</span><div class="pbar ${u.percentUsed>80?`warn`:``}"><i style="width:${Math.min(100,u.percentUsed)}%"></i></div></div>`:c}
    </div>`}changesSection(){let e=this.files;if(!e||!e.files.length)return c;let t=e.totals;return r`
      <div class="sectrow"><h2 class="sect">Cambios</h2>${e.fromGit?c:r`<span class="muted" style="font-size:.72rem">aprox. (sin git)</span>`}</div>
      <div class="changes">
        <div class="changes-head">
          <span class="ch-n">${t.files} fichero${t.files===1?``:`s`}</span>
          <span class="ch-stat"><span class="ch-add">+${o(t.added)}</span><span class="ch-del">−${o(t.removed)}</span></span>
        </div>
        <ul class="ch-list">
          ${e.files.map(e=>r`<li class="ch-row">
            <span class="k ${e.k}" title=${e.k}>${this.sign(e.k)}</span>
            <button class="ch-path" @click=${()=>this.viewDiff(e.p)} title="ver diff de ${e.p}">${e.p}</button>
            ${e.added==null?c:r`<span class="ch-rstat"><span class="ch-add">+${e.added}</span><span class="ch-del">−${e.removed}</span></span>`}
          </li>`)}
        </ul>
      </div>`}pipeline(e){let t=new Set(e.phases.map(e=>e.phase)),n=(e.plan??[]).filter(n=>!t.has(n)&&(!e.current||e.current.phase!==n));return r`<h2 class="sect">Pipeline</h2>
      <div class="rail">
        ${e.phases.map(e=>this.phaseCard(e))}
        ${e.current?this.currentCard(e.current,e.now):c}
        ${n.map(e=>r`<div class="ph todo"><div class="row"><span class="name muted">○ ${m(e)} ${e}</span></div></div>`)}
      </div>
    `}fileList(e){return e?.length?r`<details class="files"><summary>${e.length} fichero(s)</summary><ul>
      ${e.map(e=>r`<li><span class="k ${e.k}">${this.sign(e.k)}</span> <button class="lnk" @click=${()=>this.viewDiff(e.p)}>${e.p}</button></li>`)}
    </ul></details>`:c}phaseContext(e){let t=e.context;if(!t)return c;let n=t.instructions??[],i=t.contextFiles??[];return!n.length&&!i.length?c:r`<details class="ph-ctx">
      <summary>Contexto del agente</summary>
      ${n.length?r`<div class="ctx-row"><span class="ctx-lbl">Instrucciones</span><span class="ctx-chips">${n.map(e=>r`<code class="ctx-chip">${e.split(`/`).pop()}</code>`)}</span></div>`:c}
      ${i.length?r`<div class="ctx-row"><span class="ctx-lbl">Archivos</span><span class="ctx-chips">${i.map(e=>r`<code class="ctx-chip">${e}</code>`)}</span></div>`:c}
    </details>`}phaseCard(e){return r`<div class="ph ${e.ok?`done`:`bad`}">
      <div class="row">
        <span class="name"><a href="${this.runPath()}?phase=${e.phase}">${e.ok?`✅`:`❌`} ${m(e.phase)} ${e.phase}</a></span>
        <span class="role">${e.role}</span>
        ${e.model?r`<span class="badge prov-${e.provider??`none`}">${h(e.model,e.provider)} ${e.model}</span>`:c}
        ${e.modelMismatch?r`<span class="badge warn" title="el proveedor reportó otro modelo">⚠ modelo</span>`:c}
        ${e.attempts>1?r`<span class="badge">${e.attempts}×</span>`:c}
        ${e.lenses?r`<span class="badge">${e.lenses.length} lentes</span>`:c}
        ${e.resumed?r`<span class="badge">⏯ heredada</span>`:c}
        <span class="right">${i(e.ms)} · ↓${o(e.tokens?.in)} ↑${o(e.tokens?.out)}</span>
      </div>
      ${this.fileList(e.files)}
      ${this.phaseContext(e)}
      ${e.phase===`apply`||e.phase===`fix`?r`<div style="margin-top:var(--sp-2)"><button class="rollbtn" @click=${()=>void this.rollback(e.phase)}>↩ Deshacer</button></div>`:c}
      ${e.hasRaw?r`<raw-output .apiBase=${this.apiBase} .phase=${e.phase}></raw-output>`:c}
      ${e.lastError?r`<div class="errline">${e.lastError}</div>`:c}
    </div>`}currentCard(e,t){let n=e.timeoutMs?Math.min(95,Math.round((t-e.startedAt)/e.timeoutMs*100)):40;return r`<div class="ph now">
      <div class="row">
        <span class="name">▶ ${m(e.phase)} ${e.phase}</span>
        <span class="role">${e.role} · intento ${e.attempt}/${e.maxAttempts} · ${e.model??`sesión`}</span>
      </div>
      <div class="bar"><i style="width:${n}%"></i></div>
      ${e.lastError?r`<div class="errline">${e.lastError}</div>`:c}
    </div>`}logBox(e){return r`<h2 class="sect">Registro</h2>
      <pre class="logpre">${(e.logTail??[]).join(`
`)||`—`}</pre>`}};u([t()],v.prototype,`apiBase`,void 0),u([t()],v.prototype,`change`,void 0),u([t()],v.prototype,`projId`,void 0),u([t()],v.prototype,`phaseId`,void 0),u([d()],v.prototype,`s`,void 0),u([d()],v.prototype,`err`,void 0),u([d()],v.prototype,`selected`,void 0),u([d()],v.prototype,`note`,void 0),u([d()],v.prototype,`hotModel`,void 0),u([d()],v.prototype,`models`,void 0),u([d()],v.prototype,`files`,void 0),v=u([n(`run-screen`)],v);export{v as RunScreen};
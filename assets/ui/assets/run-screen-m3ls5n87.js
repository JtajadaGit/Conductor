import{a as e,c as t,d as n,f as r,g as i,i as a,m as o,n as s,p as c,s as l,t as u,u as d}from"./index-Bfc-rE4S.js";import"./status-pill-DQe8w0Ss.js";var f=class{constructor(e,t,n){this.base=e,this.onState=t,this.onError=n,this.timer=null,this.abort=null,this.lastHash=``,this.stopped=!0}start(){this.stopped=!1,this.lastHash=``,this.tick()}stop(){this.stopped=!0,this.timer!=null&&(clearTimeout(this.timer),this.timer=null),this.abort&&=(this.abort.abort(),null)}schedule(e){this.stopped||(this.timer=setTimeout(()=>void this.tick(),e))}async tick(){if(!this.stopped){this.abort=new AbortController;try{let e=await(await fetch(this.base+`state`,{signal:this.abort.signal})).json();if(this.stopped)return;if(!e||typeof e!=`object`||Array.isArray(e)){this.schedule(3e3);return}let t={...e,phases:Array.isArray(e.phases)?e.phases:[]},n=this.hashOf(t);if(n!==this.lastHash&&(this.lastHash=n,this.onState(t)),t.done){this.stop();return}this.schedule(t.pending?5e3:2e3)}catch(e){if(this.stopped)return;e.name!==`AbortError`&&this.onError?.(e),this.schedule(3e3)}}}hashOf(e){let{now:t,...n}=e;return JSON.stringify(n)}},p={explore:`🔍`,propose:`📝`,clarify:`❓`,spec:`📐`,design:`🧩`,tasks:`🗂️`,apply:`🛠️`,test:`🧪`,fix:`🔧`,verify:`🛡️`};function m(e){return p[e]??`•`}function h(e,t){let n=(e??``).toLowerCase();return t===`byok`||/qwen|deepseek/.test(n)?`🔑`:/opus/.test(n)?`🧠`:/sonnet/.test(n)?`🎼`:/haiku/.test(n)?`⚡`:/gpt/.test(n)?`🤖`:`💼`}var g=class extends d{constructor(...e){super(...e),this.apiBase=`/api/`,this.phase=``,this.text=``,this.loaded=!1}async load(){if(!this.loaded){this.loaded=!0,this.text=`…`;try{let e=await(await fetch(this.apiBase+`raw?phase=`+encodeURIComponent(this.phase))).text();this.text=e&&e!==`no encontrado`?e.trim():`No se registró salida del modelo para esta fase.`}catch{this.text=`No se pudo cargar la salida del modelo.`}}}render(){return i`<details class="raw" @toggle=${e=>{e.target.open&&this.load()}}>
      <summary>Salida sin procesar del modelo</summary>
      <pre class="rawpre">${(this.text||`…`).trim()||`…`}</pre>
    </details>`}};u([r()],g.prototype,`apiBase`,void 0),u([r()],g.prototype,`phase`,void 0),u([n()],g.prototype,`text`,void 0),u([n()],g.prototype,`loaded`,void 0),g=u([c(`raw-output`)],g);var _=class extends d{constructor(...e){super(...e),this.cost=null}render(){let e=this.cost?.byModel;if(!e||!Object.keys(e).length)return o;let t=Object.values(e).reduce((e,t)=>e+(t.in||0),0)||1;return i`<h2 class="sect">Coste por modelo</h2>
      <div class="mb-list">
        ${Object.entries(e).map(([e,n])=>{let r=Math.max(0,Math.min(100,Math.round((Number(n.in)||0)/t*100)));return i`<div class="mb-row">
            <span class="mb-name" title=${e}>${e}</span>
            <span class="mb-track"><i style="width:${r}%"></i></span>
            <span class="mb-meta">${r}% · ↓${s(n.in)} ↑${s(n.out)} · ${n.phases} fase(s)</span>
          </div>`})}
      </div>`}};u([r({attribute:!1})],_.prototype,`cost`,void 0),_=u([c(`model-breakdown`)],_);var v=class extends d{constructor(...e){super(...e),this.apiBase=`/api/`,this.change=``,this.projId=``,this.phaseId=``,this.s=null,this.err=``,this.selected=new Set,this.note=``,this.hotModel=``,this.models=null,this.files=null,this.busy=``,this.actionErr=``,this.archivedMsg=``,this.filesSig=``,this.api=new l(`/api/`),this.poller=null,this.activeBase=``}updated(e){this.apiBase&&this.apiBase!==this.activeBase&&(this.activeBase=this.apiBase,this.restart())}disconnectedCallback(){super.disconnectedCallback(),this.poller?.stop(),document.title=`conductor`}restart(){this.poller?.stop(),this.s=null,this.err=``,this.files=null,this.filesSig=``,this.api=new l(this.apiBase),this.poller=new f(this.apiBase,e=>{this.s=e,this.maybeFetchFiles(e),document.title=e.pending?`⏸ tu decisión — conductor`:`conductor`},e=>{this.err=e.message}),this.poller.start(),new l(`/api/`).models().then(e=>{this.models=e}).catch(()=>{})}async maybeFetchFiles(e){let t=(e.verdict??``)+`|`+e.phases.filter(e=>e.ok).length;if(t!==this.filesSig)try{this.files=await this.api.runFiles(),this.filesSig=t}catch{}}hotModelSelect(){let e=this.models,t=e?.copilot??[],n=e?.byok??[],r=!!e?.byokCreds;return i`<label class="fl">Cambiar modelo<select .value=${this.hotModel} @change=${e=>{this.hotModel=e.target.value}}>
      <option value="">Mantener el modelo de esta fase</option>
      ${t.length?i`<optgroup label="Copilot">${t.map(e=>i`<option value="copilot:${e}">${e}</option>`)}</optgroup>`:o}
      ${r&&n.length?i`<optgroup label="qwen · LiteLLM">${n.map(e=>i`<option value="byok:${e}">${e}</option>`)}</optgroup>`:o}
    </select></label>`}async approve(e){this.busy=`approve`,this.actionErr=``;try{let t=await this.api.continue({selected:e?[...this.selected]:void 0,note:this.note||void 0,model:this.hotModel||void 0});if(!t.ok){this.actionErr=t.error||`no se pudo aprobar — reintenta o detén el run`;return}this.note=``,this.hotModel=``,this.selected=new Set,this.s&&={...this.s,pending:null}}finally{this.busy=``}}async resumeRun(){this.busy=`resume`,this.actionErr=``;try{let e=await this.api.resume();if(!e.ok){this.actionErr=e.error||`no se pudo reanudar`;return}this.restart()}finally{this.busy=``}}async archiveRun(){if(confirm(`¿Archivar este change? Se promueve la spec a la fuente de verdad y el change pasa al histórico. Tu código no se toca.`)){this.busy=`archive`,this.actionErr=``;try{let e=await this.api.archiveRun();if(!e.ok){this.actionErr=e.error||`no se pudo archivar`;return}let t=e.needsManualMerge?.length?` · ${e.needsManualMerge.length} spec(s) requieren merge manual (cambios no aditivos)`:``;this.archivedMsg=`Archivado. ${e.promoted?.length??0} spec(s) promovidas${t}.`}finally{this.busy=``}}}toggleSel(e,t){let n=new Set(this.selected);t?n.add(e):n.delete(e),this.selected=n}async rollback(e){if(confirm(`¿Deshacer "${e}"? Se restaurarán los archivos al estado previo a esta fase. La rama de git no se modifica.`)){this.busy=`rollback`,this.actionErr=``;try{let t=await this.api.rollback(e);t.ok||(this.actionErr=t.error||`no se pudo deshacer`)}finally{this.busy=``}}}viewDiff(e){document.dispatchEvent(new CustomEvent(`cdr-view`,{detail:{apiBase:this.apiBase,kind:`diff`,path:e}}))}viewArtifact(e){document.dispatchEvent(new CustomEvent(`cdr-view`,{detail:{apiBase:this.apiBase,kind:`art`,path:e}}))}runPath(){return location.pathname.replace(/\/+$/,``)}dashboardHref(){return this.projId?`/artifact/${this.projId}/${this.change}/dashboard.html`:`/artifact/${this.change}/dashboard.html`}sessionHref(){return this.projId?`/session/${this.projId}/${this.change}`:`/session/${this.change}`}sign(e){return e===`create`?`+`:e===`delete`?`−`:`±`}render(){if(this.err&&!this.s)return i`<p class="errline" role="alert">Error: ${this.err}</p>`;let n=this.s;return n?i`
      <div class="apphdr">
        <h1 class="trunc">${this.change||n.project||`run`}</h1>
        <span role="status" aria-live="polite"><status-pill .verdict=${n.pending?`EN PAUSA`:n.verdict??`EN CURSO`}></status-pill></span>
      </div>
      <p class="subhead">${n.project||`—`}${n.branch?i` · ${n.branch}`:``}</p>
      <div class="actbar">
        <a class="btn sm sec" href=${this.sessionHref()}>Ver sesión</a>
        ${n.done&&e(n.verdict)!==`GREEN`?i`<button class="btn sm sec resume" ?disabled=${this.busy===`resume`} @click=${()=>void this.resumeRun()}>${this.busy===`resume`?`Reanudando…`:`↻ Reanudar`}</button>`:o}
        ${n.done&&e(n.verdict)===`GREEN`&&!this.archivedMsg?i`<button class="btn sm sec" ?disabled=${this.busy===`archive`} @click=${()=>void this.archiveRun()}>${this.busy===`archive`?`Archivando…`:`⬆ Archivar`}</button>`:o}
        ${n.hasDashboard?i`<a class="btn sm sec dash" href=${this.dashboardHref()} target="_blank">Informe</a>`:o}
        <a class="btn sm sec aiact" href=${this.apiBase+`aiact`} target="_blank">AI Act</a>
        ${n.done?o:i`<button class="btn sm stop" ?disabled=${n.stopRequested} @click=${()=>void this.api.stop()}>${n.stopRequested?`Deteniendo…`:`■ Detener`}</button>`}
      </div>
      ${this.actionErr?i`<div class="errline" role="alert">${this.actionErr}</div>`:o}
      ${this.archivedMsg?i`<div class="whybox ok" role="status">${this.archivedMsg} <a href="/">Volver al panel</a></div>`:o}
      ${n.done&&n.reason&&e(n.verdict)!==`GREEN`?i`<div class="whybox" role="alert"><b>Por qué:</b> ${n.reason}</div>`:o}
      ${n.tests?.ran?i`<div class="muted" style="margin:.1rem 0 .9rem;font-size:.82rem">Pruebas del proyecto (antes de verify): ${n.tests.passed?i`<span style="color:var(--ok);font-weight:600">✓ pasaron</span>`:i`<span style="color:var(--warn);font-weight:600">✗ fallaron</span>`} <code style="font-size:.85em">${n.tests.cmds.join(` · `)}</code>${!n.tests.passed&&n.tests.failed.length?i` <span class="muted">— falló: ${n.tests.failed.join(`, `)}</span>`:o}</div>`:o}
      ${this.requestBox(n)}
      ${this.phaseId?this.phaseDetail(n):o}
      ${n.pending?this.pendingCard(n.pending,n):o}
      ${this.cards(n)}
      ${this.pipeline(n)}
      ${this.changesSection()}
      ${n.cost?i`<model-breakdown .cost=${n.cost}></model-breakdown>`:o}
      ${this.logBox(n)}
    `:t(`Cargando run`)}requestBox(e){return i`<details class="req" ?open=${!(e.request&&e.request.length>90)}>
      <summary class="req-sum"><span class="req-lbl">Prompt</span><span class="req-badge">${e.complexity}${e.resumed?` · reanudado`:``}</span></summary>
      <p class="req-body">${e.request}</p>
    </details>`}phaseDetail(e){let t=e.phases.find(e=>e.phase===this.phaseId);return t?i`<div class="ph">
      <div class="row">
        <span class="name">${m(t.phase)} Detalle: ${t.phase}</span>
        <span class="role">${t.role}</span>
        <span class="right">${a(t.ms)} · ↓${s(t.tokens?.in)} ↑${s(t.tokens?.out)}</span>
      </div>
      ${this.fileList(t.files)}
      ${t.hasRaw?i`<raw-output .apiBase=${this.apiBase} .phase=${t.phase}></raw-output>`:o}
      <div style="margin-top:var(--sp-2)"><a class="btn sm sec" href=${this.runPath()}>← volver</a></div>
    </div>`:o}reviewArtifacts(e){let t={explore:`exploration.md`,propose:`proposal.md`,clarify:`questions.md`,design:`design.md`,tasks:`tasks.md`,apply:`apply-report.md`},n=[];for(let r of e.phases)if(r.ok)if(r.phase===`spec`){let e=r.files?.find(e=>/specs[\\/].+[\\/]spec\.md$/i.test(e.p)),t=e?e.p.replace(/\\/g,`/`).replace(/^.*openspec\/changes\/[^/]+\//,``):``;t&&t.startsWith(`specs/`)&&n.push({label:`spec.md`,path:t})}else t[r.phase]&&n.push({label:t[r.phase],path:t[r.phase]});return n.filter((e,t)=>n.findIndex(t=>t.path===e.path)===t)}pendingCard(e,t){let n=this.reviewArtifacts(t),r=(e.findings??[]).map(e=>typeof e==`string`?{message:e}:e);return i`<section class="decision">
      <header class="decision-head">
        <span class="decision-led" aria-hidden="true"></span>
        <div class="decision-titles">
          <h2 class="decision-title">Decisión del revisor</h2>
          <span class="decision-sub" role="status" aria-live="polite">Antes de <b>${e.before}</b> · ${r.length?`selecciona los hallazgos a corregir o ajusta la fase`:`revisa y aprueba para continuar`}</span>
        </div>
      </header>
      <div class="decision-body">
        ${n.length?i`<div class="decision-arts"><span class="ctx-lbl">Revisar</span>${n.map(e=>i`<button type="button" class="lnk" title="abrir ${e.path} (editable)" @click=${()=>this.viewArtifact(e.path)}>📄 ${e.label}</button>`)}</div>`:o}
        ${r.length?i`<ul class="decision-findings">${r.map((e,t)=>i`
          <li>
            <label><input type="checkbox" .checked=${this.selected.has(t)} @change=${e=>this.toggleSel(t,e.target.checked)}>
              <span class="fnd">${e.severity?i`<span class="sev ${e.severity===`error`?`error`:`aviso`}">${e.severity===`error`?`error`:`aviso`}</span>`:o}${e.message}</span></label>
            ${e.file?/\.(md|txt)$/.test(e.file)?i`<button type="button" class="lnk fnd-file" title="ver ${e.file}" @click=${()=>this.viewArtifact(e.file)}>${e.file}</button>`:i`<code class="fnd-file">${e.file}</code>`:o}
          </li>`)}</ul>`:o}
        <div class="pend-controls">
          <label class="fl" style="flex:1;min-width:14rem">Nota (opcional)<textarea class="pend-note" rows="2" .value=${this.note} @input=${e=>{this.note=e.target.value}} placeholder="Instrucción para esta fase (opcional)"></textarea></label>
          ${this.hotModelSelect()}
        </div>
        <button class="approve" ?disabled=${this.busy===`approve`} @click=${()=>void this.approve(r.length>0)}>${this.busy===`approve`?`Enviando…`:r.length?`Corregir los hallazgos seleccionados`:`Aprobar y continuar`}</button>
      </div>
    </section>`}cards(e){let t=e.phases.filter(e=>e.ok).length,n=e.plan?.length||e.phases.length,r=e.phases.reduce((e,t)=>e+(t.tokens?.in??0),0),c=e.phases.reduce((e,t)=>e+(t.tokens?.out??0),0),l=e.phases.reduce((e,t)=>e+(t.files?.length??0),0),u=e.ghUsage;return i`<div class="cards">
      <div class="card"><small>Fases</small><span>${t} / ${n}</span></div>
      <div class="card"><small>Tokens entrada</small><span>↓ ${s(r)}</span></div>
      <div class="card"><small>Tokens salida</small><span>↑ ${s(c)}</span></div>
      <div class="card"><small>Ficheros</small><span>${l}</span></div>
      <div class="card"><small>Tiempo</small><span>${a(e.total_ms??(e.current?e.now-e.current.startedAt:null))}</span></div>
      ${e.usage?i`<div class="card"><small>qwen · LiteLLM</small><span>$${e.usage.spend.toFixed(2)}${e.usage.budget?i` / $${e.usage.budget.toFixed(0)}`:o}</span>${e.usage.budget?i`<div class="pbar ${e.usage.spend/e.usage.budget>.8?`warn`:``}"><i style="width:${Math.min(100,e.usage.spend/e.usage.budget*100)}%"></i></div>`:o}</div>`:o}
      ${u?i`<div class="card aic"><small>AI Credits</small><span>${u.used}/${u.entitlement}</span><div class="pbar ${u.percentUsed>80?`warn`:``}"><i style="width:${Math.min(100,u.percentUsed)}%"></i></div></div>`:o}
      ${e.savings&&e.savings.byok_phases>0?i`<div class="card ok" title="Fases ejecutadas en qwen vía LiteLLM: no consumen AI Credits (↓${s(e.savings.byok_in)} ↑${s(e.savings.byok_out)} tokens fuera de Copilot)"><small>Ahorro qwen</small><span>${e.savings.byok_phases}/${e.savings.byok_phases+e.savings.copilot_phases} fases · 0 AIC</span></div>`:o}
    </div>`}changesSection(){let e=this.files;if(!e?.files?.length)return o;let t=e.totals;return i`
      <div class="sectrow"><h2 class="sect">Cambios</h2>${e.fromGit?o:i`<span class="muted" style="font-size:.72rem">aprox. (sin git)</span>`}</div>
      <div class="changes">
        <div class="changes-head">
          <span class="ch-n">${t.files} fichero${t.files===1?``:`s`}</span>
          <span class="ch-stat"><span class="ch-add">+${s(t.added)}</span><span class="ch-del">−${s(t.removed)}</span></span>
        </div>
        <ul class="ch-list">
          ${e.files.map(e=>i`<li class="ch-row">
            <span class="k ${e.k}" title=${e.k}>${this.sign(e.k)}</span>
            <button class="ch-path" @click=${()=>this.viewDiff(e.p)} title="ver diff de ${e.p}">${e.p}</button>
            ${e.added==null?o:i`<span class="ch-rstat"><span class="ch-add">+${e.added}</span><span class="ch-del">−${e.removed}</span></span>`}
          </li>`)}
        </ul>
      </div>`}pipeline(e){let t=new Set(e.phases.map(e=>e.phase)),n=(e.plan??[]).filter(n=>!t.has(n)&&(!e.current||e.current.phase!==n));return i`<h2 class="sect">Pipeline</h2>
      <div class="rail">
        ${e.phases.map(e=>this.phaseCard(e))}
        ${e.current?this.currentCard(e.current,e.now):o}
        ${n.map(e=>i`<div class="ph todo"><div class="row"><span class="name muted">○ ${m(e)} ${e}</span></div></div>`)}
      </div>
    `}fileList(e){return e?.length?i`<details class="files"><summary>${e.length} fichero(s)</summary><ul>
      ${e.map(e=>i`<li><span class="k ${e.k}">${this.sign(e.k)}</span> <button class="lnk" @click=${()=>this.viewDiff(e.p)}>${e.p}</button></li>`)}
    </ul></details>`:o}phaseContext(e){let t=e.context;if(!t)return o;let n=t.instructions??[],r=t.contextFiles??[];return!n.length&&!r.length?o:i`<details class="ph-ctx">
      <summary>Contexto del agente</summary>
      ${n.length?i`<div class="ctx-row"><span class="ctx-lbl">Instrucciones</span><span class="ctx-chips">${n.map(e=>i`<code class="ctx-chip">${e.split(`/`).pop()}</code>`)}</span></div>`:o}
      ${r.length?i`<div class="ctx-row"><span class="ctx-lbl">Archivos</span><span class="ctx-chips">${r.map(e=>i`<code class="ctx-chip">${e}</code>`)}</span></div>`:o}
    </details>`}phaseCard(e){return i`<div class="ph ${e.ok?`done`:`bad`}">
      <div class="row">
        <span class="name"><a href="${this.runPath()}?phase=${e.phase}">${e.ok?`✅`:`❌`} ${m(e.phase)} ${e.phase}</a></span>
        <span class="role">${e.role}</span>
        ${e.model?i`<span class="badge prov-${e.provider??`none`}">${h(e.model,e.provider)} ${e.model}</span>`:o}
        ${e.modelMismatch?i`<span class="badge warn" title="pedido ${e.modelRequested??`?`} → el proveedor reportó ${e.modelReported??`?`}">⚠ modelo</span>`:o}
        ${e.attempts>1?i`<span class="badge">${e.attempts}×</span>`:o}
        ${e.lenses?i`<span class="badge">${e.lenses.length} lentes</span>`:o}
        ${e.resumed?i`<span class="badge">⏯ heredada</span>`:o}
        <span class="right">${a(e.ms)} · ↓${s(e.tokens?.in)} ↑${s(e.tokens?.out)}</span>
      </div>
      ${this.fileList(e.files)}
      ${this.phaseContext(e)}
      ${e.phase===`apply`||e.phase===`fix`?i`<div style="margin-top:var(--sp-2)"><button class="rollbtn" ?disabled=${this.busy===`rollback`} @click=${()=>void this.rollback(e.phase)}>${this.busy===`rollback`?`Deshaciendo…`:`↩ Deshacer`}</button></div>`:o}
      ${e.hasRaw?i`<raw-output .apiBase=${this.apiBase} .phase=${e.phase}></raw-output>`:o}
      ${e.lastError?i`<div class="errline">${e.lastError}</div>`:o}
    </div>`}currentCard(e,t){let n=e.timeoutMs?Math.min(95,Math.round((t-e.startedAt)/e.timeoutMs*100)):40;return i`<div class="ph now">
      <div class="row">
        <span class="name">▶ ${m(e.phase)} ${e.phase}</span>
        <span class="role">${e.role} · intento ${e.attempt}/${e.maxAttempts} · ${e.model??`sesión`}</span>
      </div>
      <div class="bar"><i style="width:${n}%"></i></div>
      ${e.lastError?i`<div class="errline">${e.lastError}</div>`:o}
    </div>`}logBox(e){return i`<h2 class="sect">Registro</h2>
      <pre class="logpre">${(e.logTail??[]).join(`
`)||`—`}</pre>`}};u([r()],v.prototype,`apiBase`,void 0),u([r()],v.prototype,`change`,void 0),u([r()],v.prototype,`projId`,void 0),u([r()],v.prototype,`phaseId`,void 0),u([n()],v.prototype,`s`,void 0),u([n()],v.prototype,`err`,void 0),u([n()],v.prototype,`selected`,void 0),u([n()],v.prototype,`note`,void 0),u([n()],v.prototype,`hotModel`,void 0),u([n()],v.prototype,`models`,void 0),u([n()],v.prototype,`files`,void 0),u([n()],v.prototype,`busy`,void 0),u([n()],v.prototype,`actionErr`,void 0),u([n()],v.prototype,`archivedMsg`,void 0),v=u([c(`run-screen`)],v);export{v as RunScreen};
import{_ as e,a as t,c as n,d as r,f as i,h as a,l as o,m as s,n as c,o as l,p as u,t as d}from"./index-BdEtYID6.js";import"./status-pill-L1t_IArT.js";var f=class{constructor(e,t,n){this.base=e,this.onState=t,this.onError=n,this.timer=null,this.abort=null,this.lastHash=``,this.stopped=!0}start(){this.stopped=!1,this.lastHash=``,this.tick()}stop(){this.stopped=!0,this.timer!=null&&(clearTimeout(this.timer),this.timer=null),this.abort&&=(this.abort.abort(),null)}schedule(e){this.stopped||(this.timer=setTimeout(()=>void this.tick(),e))}async tick(){if(!this.stopped){this.abort=new AbortController;try{let e=await(await fetch(this.base+`state`,{signal:this.abort.signal})).json();if(this.stopped)return;if(!e||typeof e!=`object`||Array.isArray(e)){this.schedule(3e3);return}let t={...e,phases:Array.isArray(e.phases)?e.phases:[]},n=this.hashOf(t);if(n!==this.lastHash&&(this.lastHash=n,this.onState(t)),t.done){this.stop();return}this.schedule(t.pending?5e3:2e3)}catch(e){if(this.stopped)return;e.name!==`AbortError`&&this.onError?.(e),this.schedule(3e3)}}}hashOf(e){let{now:t,...n}=e;return JSON.stringify(n)}},p={explore:`🔍`,propose:`📝`,clarify:`❓`,spec:`📐`,design:`🧩`,tasks:`🗂️`,apply:`🛠️`,test:`🧪`,fix:`🔧`,verify:`🛡️`};function m(e){return p[e]??`•`}function h(e,t){let n=(e??``).toLowerCase();return t===`byok`||/qwen|deepseek/.test(n)?`🔑`:/opus/.test(n)?`🧠`:/sonnet/.test(n)?`🎼`:/haiku/.test(n)?`⚡`:/gpt/.test(n)?`🤖`:`💼`}var g=class extends r{constructor(...e){super(...e),this.apiBase=`/api/`,this.phase=``,this.text=``,this.loaded=!1}async load(){if(!this.loaded){this.loaded=!0,this.text=`…`;try{let e=await(await fetch(this.apiBase+`raw?phase=`+encodeURIComponent(this.phase))).text();this.text=e&&e!==`no encontrado`?e.trim():`No se registró salida del modelo para esta fase.`}catch{this.text=`No se pudo cargar la salida del modelo.`}}}render(){return e`<details class="raw" @toggle=${e=>{e.target.open&&this.load()}}>
      <summary>salida del modelo</summary>
      <pre class="rawpre">${(this.text||`…`).trim()||`…`}</pre>
    </details>`}};d([u()],g.prototype,`apiBase`,void 0),d([u()],g.prototype,`phase`,void 0),d([i()],g.prototype,`text`,void 0),d([i()],g.prototype,`loaded`,void 0),g=d([s(`raw-output`)],g);var _=class extends r{constructor(...e){super(...e),this.cost=null}render(){let t=this.cost?.byModel;if(!t||!Object.keys(t).length)return a;let n=Object.values(t).reduce((e,t)=>e+(t.in||0),0)||1;return e`<h2 class="sect">Coste por modelo</h2>
      <div class="mb-list">
        ${Object.entries(t).map(([t,r])=>{let i=Math.max(0,Math.min(100,Math.round((Number(r.in)||0)/n*100)));return e`<div class="mb-row">
            <span class="mb-name" title=${t}>${t}</span>
            <span class="mb-track"><i style="width:${i}%"></i></span>
            <span class="mb-meta">${i}% · ↓${c(r.in)} ↑${c(r.out)} · ${r.phases} ${r.phases===1?`fase`:`fases`}</span>
          </div>`})}
      </div>`}};d([u({attribute:!1})],_.prototype,`cost`,void 0),_=d([s(`model-breakdown`)],_);var v=class extends r{constructor(...e){super(...e),this.apiBase=`/api/`,this.change=``,this.projId=``,this.phaseId=``,this.s=null,this.err=``,this.selected=new Set,this.note=``,this.hotModel=``,this.models=null,this.files=null,this.busy=``,this.actionErr=``,this.archivedMsg=``,this.filesSig=``,this.pendingKey=``,this.api=new n(`/api/`),this.poller=null,this.activeBase=``,this.stopping=!1}updated(e){this.apiBase&&this.apiBase!==this.activeBase&&(this.activeBase=this.apiBase,this.restart())}disconnectedCallback(){super.disconnectedCallback(),this.poller?.stop(),document.title=`conductor`}restart(){this.poller?.stop(),this.s=null,this.err=``,this.files=null,this.filesSig=``,this.stopping=!1,this.pendingKey=``,this.selected=new Set,this.note=``,this.hotModel=``,this.api=new n(this.apiBase),this.poller=new f(this.apiBase,e=>{e.done&&(this.stopping=!1);let t=e.pending?`${e.pending.before}|${(e.pending.findings||[]).length}`:``;t!==this.pendingKey&&(this.pendingKey=t,t&&(this.selected=new Set,this.note=``,this.hotModel=``)),this.s=e,this.maybeFetchFiles(e),document.title=e.pending?`⏸ tu decisión — conductor`:`conductor`},e=>{this.err=e.message}),this.poller.start(),new n(`/api/`).models().then(e=>{this.models=e}).catch(()=>{})}async maybeFetchFiles(e){let t=(e.verdict??``)+`|`+e.phases.filter(e=>e.ok).length;if(t!==this.filesSig)try{this.files=await this.api.runFiles(),this.filesSig=t}catch{}}hotModelSelect(){let t=this.models,n=t?.copilot??[],r=t?.byok??[],i=!!t?.byokCreds;return e`<label class="fl">Cambiar modelo<select .value=${this.hotModel} title=${t?`Copilot: ${t.copilotSource} · qwen: ${t.byokSource}`:``} @change=${e=>{this.hotModel=e.target.value}}>
      <option value="">Mantener el modelo de esta fase</option>
      ${n.length?e`<optgroup label="Copilot${t?.copilotPending?` · vistos en tus runs`:``}">${n.map(t=>e`<option value="copilot:${t}">${t}</option>`)}</optgroup>`:e`<option value="" disabled>catálogo Copilot aún no disponible</option>`}
      ${i&&r.length?e`<optgroup label="qwen · LiteLLM">${r.map(t=>e`<option value="byok:${t}">${t}</option>`)}</optgroup>`:a}
    </select></label>`}async approve(e){this.busy=`approve`,this.actionErr=``;try{let t=await this.api.continue({selected:e?[...this.selected]:void 0,note:this.note||void 0,model:this.hotModel||void 0});if(!t.ok){this.actionErr=t.error||`no se pudo aprobar — reintenta o detén el run`;return}this.note=``,this.hotModel=``,this.selected=new Set,this.s&&={...this.s,pending:null}}finally{this.busy=``}}async resumeRun(){this.busy=`resume`,this.actionErr=``;try{let e=await this.api.resume();if(!e.ok){this.actionErr=e.error||`no se pudo reanudar`;return}this.restart()}finally{this.busy=``}}async archiveRun(){if(confirm(`¿Archivar este change? Se promueve la spec a la fuente de verdad y el change pasa al histórico. Tu código no se toca.`)){this.busy=`archive`,this.actionErr=``;try{let e=await this.api.archiveRun();if(!e.ok){this.actionErr=e.error||`no se pudo archivar`;return}let t=e.needsManualMerge?.length??0,n=t?` · ${t} spec${t===1?``:`s`} ${t===1?`requiere`:`requieren`} merge manual (cambios no aditivos)`:``,r=e.promoted?.length??0;this.archivedMsg=`Archivado. ${r} spec${r===1?``:`s`} ${r===1?`promovida`:`promovidas`}${n}.`}finally{this.busy=``}}}toggleSel(e,t){let n=new Set(this.selected);t?n.add(e):n.delete(e),this.selected=n}async stopRun(){let e=this.s?.pending??null;this.stopping=!0,this.actionErr=``,this.s&&={...this.s,pending:null};try{let t=await this.api.stop();t.ok||(this.actionErr=t.error||`no se pudo detener`,this.stopping=!1,this.s&&={...this.s,pending:e})}catch{this.actionErr=`no se pudo detener`,this.stopping=!1,this.s&&={...this.s,pending:e}}}async rollback(e){if(confirm(`¿Deshacer "${e}"? Se restaurarán los archivos al estado previo a esta fase. La rama de git no se modifica.`)){this.busy=`rollback`,this.actionErr=``;try{let t=await this.api.rollback(e);t.ok||(this.actionErr=t.error||`no se pudo deshacer`)}finally{this.busy=``}}}viewDiff(e){document.dispatchEvent(new CustomEvent(`cdr-view`,{detail:{apiBase:this.apiBase,kind:`diff`,path:e}}))}viewArtifact(e){document.dispatchEvent(new CustomEvent(`cdr-view`,{detail:{apiBase:this.apiBase,kind:`art`,path:e}}))}runPath(){return location.pathname.replace(/\/+$/,``)}dashboardHref(){return this.projId?`/artifact/${this.projId}/${this.change}/dashboard.html`:`/artifact/${this.change}/dashboard.html`}sessionHref(){return this.projId?`/session/${this.projId}/${this.change}`:`/session/${this.change}`}sign(e){return e===`create`?`+`:e===`delete`?`−`:`±`}render(){if(this.err&&!this.s)return e`<p class="errline" role="alert">Error: ${this.err}</p>`;let t=this.s;return t?e`
      ${this.apiBase.includes(`/demo`)?e`<div class="whybox ok" role="note" style="margin-bottom:1rem"><b>Demo</b> — pantalla de muestra con datos ficticios (modelos, cambios y coste no son reales). <a href="/">Ir a tu panel</a></div>`:a}
      <div class="apphdr">
        <h1 class="trunc">${this.change||t.project||`run`}</h1>
        <span role="status" aria-live="polite"><status-pill .verdict=${t.pending?`EN PAUSA`:t.verdict??`EN CURSO`}></status-pill></span>
      </div>
      <p class="subhead">${t.project||`—`}${t.branch?e` · ${t.branch}`:``}</p>
      <div class="actbar">
        <a class="btn sm sec" href=${this.sessionHref()}>📃 Ver sesión</a>
        ${t.done&&l(t.verdict)!==`GREEN`?e`<button class="btn sm resume" ?disabled=${this.busy===`resume`} @click=${()=>void this.resumeRun()}>${this.busy===`resume`?`Reanudando…`:`↻ Reanudar`}</button>`:a}
        ${t.done&&l(t.verdict)===`GREEN`&&!this.archivedMsg?e`<button class="btn sm arch" ?disabled=${this.busy===`archive`} @click=${()=>void this.archiveRun()}>${this.busy===`archive`?`Archivando…`:`⬆ Archivar`}</button>`:a}
        ${t.hasDashboard?e`<a class="btn sm dash" href=${this.dashboardHref()} target="_blank">📊 Informe</a>`:a}
        <a class="btn sm aiact" href=${this.apiBase+`aiact`} target="_blank">🛡 AI Act</a>
        ${t.done?a:e`<button class="btn sm stop" ?disabled=${t.stopRequested||this.stopping} @click=${()=>void this.stopRun()}>${t.stopRequested||this.stopping?`Deteniendo…`:`■ Detener`}</button>`}
      </div>
      ${this.actionErr?e`<div class="errline" role="alert">${this.actionErr}</div>`:a}
      ${this.archivedMsg?e`<div class="whybox ok" role="status">${this.archivedMsg} <a href="/">Volver al panel</a></div>`:a}
      ${t.done&&t.reason&&l(t.verdict)!==`GREEN`?e`<div class="whybox" role="alert"><svg class="why-ic" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 4.3v4.4M8 11.0v.05" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><span><b>Por qué:</b> ${t.reason}</span></div>`:a}
      ${t.tests?.ran?e`<div class="muted" style="margin:.1rem 0 .9rem;font-size:.82rem">Pruebas del proyecto (antes de verify): ${t.tests.passed?e`<span style="color:var(--ok);font-weight:600">✓ pasaron</span>`:e`<span style="color:var(--warn);font-weight:600">✗ fallaron</span>`} <code style="font-size:.85em">${t.tests.cmds.join(` · `)}</code>${!t.tests.passed&&t.tests.failed.length?e` <span class="muted">— falló: ${t.tests.failed.join(`, `)}</span>`:a}</div>`:a}
      ${t.done?(()=>{let n=this.reviewArtifacts(t);return n.length?e`<div class="decision-arts" style="margin:0 0 .9rem"><span class="ctx-lbl">Artefactos</span>${n.map(t=>e`<button type="button" class="lnk" title="abrir ${t.path} (editable)" @click=${()=>this.viewArtifact(t.path)}>📄 ${t.label}</button>`)}<button type="button" class="lnk" title="abrir verify-report.md" @click=${()=>this.viewArtifact(`verify-report.md`)}>📄 verify-report.md</button></div>`:a})():a}
      ${this.requestBox(t)}
      ${this.phaseId?this.phaseDetail(t):a}
      ${t.pending?this.pendingCard(t.pending,t):a}
      ${this.cards(t)}
      ${this.pipeline(t)}
      ${this.changesSection()}
      ${t.cost?e`<model-breakdown .cost=${t.cost}></model-breakdown>`:a}
      ${this.logBox(t)}
    `:o(`Cargando run`)}requestBox(t){return e`<details class="req" ?open=${!(t.request&&t.request.length>90)}>
      <summary class="req-sum"><span class="req-lbl">Prompt</span><span class="req-badge">${t.complexity}${t.resumed?` · reanudado`:``}</span></summary>
      <p class="req-body">${t.request}</p>
    </details>`}phaseDetail(n){let r=n.phases.find(e=>e.phase===this.phaseId);return r?e`<div class="ph">
      <div class="row">
        <span class="name">${m(r.phase)} Detalle: ${r.phase}</span>
        <span class="role">${r.role}</span>
        <span class="right">${t(r.ms)} · ↓${c(r.tokens?.in)} ↑${c(r.tokens?.out)}</span>
      </div>
      ${this.fileList(r.files)}
      ${r.hasRaw?e`<raw-output .apiBase=${this.apiBase} .phase=${r.phase}></raw-output>`:a}
      <div style="margin-top:var(--sp-2)"><a class="btn sm sec" href=${this.runPath()}>← volver</a></div>
    </div>`:a}reviewArtifacts(e){let t={explore:`exploration.md`,propose:`proposal.md`,clarify:`questions.md`,design:`design.md`,tasks:`tasks.md`,apply:`apply-report.md`},n=[];for(let r of e.phases)if(r.ok)if(r.phase===`spec`){let e=Array.isArray(r.files)?r.files.find(e=>/specs[\\/].+[\\/]spec\.md$/i.test(e.p)):void 0,t=e?e.p.replace(/\\/g,`/`).replace(/^.*openspec\/changes\/[^/]+\//,``):``;t&&t.startsWith(`specs/`)&&n.push({label:`spec.md`,path:t})}else t[r.phase]&&n.push({label:t[r.phase],path:t[r.phase]});return n.filter((e,t)=>n.findIndex(t=>t.path===e.path)===t)}pendingCard(t,n){let r=this.reviewArtifacts(n),i=(t.findings??[]).map(e=>typeof e==`string`?{message:e}:e),o=this.selected.size,s=e=>e===`error`||e===`breaking`;return e`<section class="decision">
      <header class="decision-head">
        <span class="decision-led" aria-hidden="true"></span>
        <div class="decision-titles">
          <h2 class="decision-title">Decisión del revisor</h2>
          <span class="decision-sub" role="status" aria-live="polite">Antes de <b>${t.before}</b> · ${i.length?`selecciona los hallazgos a corregir o ajusta la fase`:`revisa y aprueba para continuar`}</span>
        </div>
      </header>
      <div class="decision-body">
        ${r.length?e`<div class="decision-arts"><span class="ctx-lbl">Revisar</span>${r.map(t=>e`<button type="button" class="lnk" title="abrir ${t.path} (editable)" @click=${()=>this.viewArtifact(t.path)}>📄 ${t.label}</button>`)}</div>`:a}
        ${i.length?e`<ul class="decision-findings">${i.map((t,n)=>e`
          <li>
            <label><input type="checkbox" .checked=${this.selected.has(n)} @change=${e=>this.toggleSel(n,e.target.checked)}>
              <span class="fnd">${t.severity?e`<span class="sev ${s(t.severity)?`error`:`aviso`}">${s(t.severity)?`error`:`aviso`}</span>`:a}${t.message}</span></label>
            ${t.file?/\.(md|txt)$/.test(t.file)?e`<button type="button" class="lnk fnd-file" title="ver ${t.file}" @click=${()=>this.viewArtifact(t.file)}>${t.file}</button>`:e`<code class="fnd-file">${t.file}</code>`:a}
          </li>`)}</ul>`:a}
        <div class="pend-controls">
          <label class="fl" style="flex:1;min-width:14rem">Nota (opcional)<textarea class="pend-note" rows="2" .value=${this.note} @input=${e=>{this.note=e.target.value}} placeholder="Instrucción para esta fase (opcional)"></textarea></label>
          ${this.hotModelSelect()}
        </div>
        <button class="approve" ?disabled=${this.busy===`approve`} @click=${()=>void this.approve(o>0)}>${this.busy===`approve`?`Enviando…`:o>0?`Corregir ${o} hallazgo${o===1?``:`s`}`:`Aprobar y continuar`}</button>
      </div>
    </section>`}cards(n){let r=n.phases.filter(e=>e.ok).length,i=n.plan?.length||n.phases.length,o=n.phases.reduce((e,t)=>e+(t.tokens?.in??0),0),s=n.phases.reduce((e,t)=>e+(t.tokens?.out??0),0),l=n.phases.reduce((e,t)=>e+(t.files?.length??0),0),u=n.ghUsage,d=n.savings;return e`<div class="statline" role="status" aria-label="resumen del run">
      <span><b>${r}/${i}</b> fases</span>
      <span>${t(n.total_ms??(n.current?n.now-n.current.startedAt:null))}</span>
      ${o+s>0?e`<span title="tokens de entrada/salida acumulados">↓${c(o)} ↑${c(s)}</span>`:a}
      ${l?e`<span>${l} fichero${l===1?``:`s`}</span>`:a}
      ${d&&d.byok_phases>0?e`<span class="st-ok" title="fases en qwen vía LiteLLM — 0 AI Credits (↓${c(d.byok_in)} ↑${c(d.byok_out)} tokens fuera de Copilot)">qwen ${d.byok_phases}/${d.byok_phases+d.copilot_phases} · 0 AIC</span>`:a}
      ${u?e`<span title="AI Credits de tu cuenta Copilot">AIC ${u.used}/${u.entitlement}</span>`:a}
    </div>`}changesSection(){let t=this.files;if(!Array.isArray(t?.files)||!t.files.length)return a;let n=t.totals;return e`
      <div class="sectrow"><h2 class="sect">Cambios</h2>${t.fromGit?a:e`<span class="muted" style="font-size:.72rem">aprox. (sin git)</span>`}</div>
      <div class="changes">
        <div class="changes-head">
          <span class="ch-n">${n.files} fichero${n.files===1?``:`s`}</span>
          <span class="ch-stat"><span class="ch-add">+${c(n.added)}</span><span class="ch-del">−${c(n.removed)}</span></span>
        </div>
        <ul class="ch-list">
          ${t.files.map(t=>e`<li class="ch-row">
            <span class="k ${t.k}" title=${t.k}>${this.sign(t.k)}</span>
            <button class="ch-path" @click=${()=>this.viewDiff(t.p)} title="ver diff de ${t.p}">${t.p}</button>
            ${t.added==null?a:e`<span class="ch-rstat"><span class="ch-add">+${t.added}</span><span class="ch-del">−${t.removed}</span></span>`}
          </li>`)}
        </ul>
      </div>`}pipeline(t){let n=new Set(t.phases.map(e=>e.phase)),r=(Array.isArray(t.plan)?t.plan:[]).filter(e=>!n.has(e)&&(!t.current||t.current.phase!==e));return e`<h2 class="sect">Pipeline</h2>
      <div class="rail">
        ${t.phases.map(e=>this.phaseCard(e))}
        ${t.current?this.currentCard(t.current,t.now):a}
        ${r.map(t=>e`<div class="ph todo"><div class="row"><span class="name muted">○ ${m(t)} ${t}</span></div></div>`)}
      </div>
    `}fileList(t){return!Array.isArray(t)||!t.length?a:e`<details class="files"><summary>${t.length} ${t.length===1?`fichero`:`ficheros`}</summary><ul>
      ${t.map(t=>e`<li><span class="k ${t.k}">${this.sign(t.k)}</span> <button class="lnk" @click=${()=>this.viewDiff(t.p)}>${t.p}</button></li>`)}
    </ul></details>`}phaseContext(t){let n=t.context;if(!n)return a;let r=Array.isArray(n.instructions)?n.instructions:[],i=Array.isArray(n.contextFiles)?n.contextFiles:[];return!r.length&&!i.length?a:e`<details class="ph-ctx">
      <summary>Contexto del agente</summary>
      ${r.length?e`<div class="ctx-row"><span class="ctx-lbl">Instrucciones</span><span class="ctx-chips">${r.map(t=>e`<code class="ctx-chip">${t.split(`/`).pop()}</code>`)}</span></div>`:a}
      ${i.length?e`<div class="ctx-row"><span class="ctx-lbl">Archivos</span><span class="ctx-chips">${i.map(t=>e`<code class="ctx-chip">${t}</code>`)}</span></div>`:a}
    </details>`}phaseCard(n){return e`<div class="ph ${n.ok?`done`:`bad`}">
      <div class="row">
        <span class="name"><a href="${this.runPath()}?phase=${n.phase}">${m(n.phase)} ${n.phase}</a></span>
        <span class="role">${n.role}</span>
        ${n.model?e`<span class="badge prov-${n.provider??`none`}">${h(n.model,n.provider)} ${n.model}</span>`:a}
        ${n.modelMismatch?e`<span class="badge warn" title="pedido ${n.modelRequested??`?`} → el proveedor reportó ${n.modelReported??`?`}">⚠ modelo</span>`:a}
        ${n.attempts>1?e`<span class="badge">${n.attempts}×</span>`:a}
        ${Array.isArray(n.lenses)&&n.lenses.length?e`<span class="badge">${n.lenses.length} lentes</span>`:a}
        ${n.resumed?e`<span class="badge">⏯ heredada</span>`:a}
        <span class="right">${t(n.ms)}${n.tokens?e` · ↓${c(n.tokens.in)} ↑${c(n.tokens.out)}`:a}</span>
      </div>
      ${this.fileList(n.files)}
      ${this.phaseContext(n)}
      ${n.phase===`apply`||n.phase===`fix`?e`<div style="margin-top:var(--sp-2)"><button class="rollbtn" ?disabled=${this.busy===`rollback`} @click=${()=>void this.rollback(n.phase)}>${this.busy===`rollback`?`Deshaciendo…`:`↩ Deshacer`}</button></div>`:a}
      ${n.hasRaw?e`<raw-output .apiBase=${this.apiBase} .phase=${n.phase}></raw-output>`:a}
      ${n.lastError?e`<div class="errline">${n.lastError}</div>`:a}
    </div>`}currentCard(t,n){let r=t.timeoutMs?Math.min(95,Math.round((n-t.startedAt)/t.timeoutMs*100)):40;return e`<div class="ph now">
      <div class="row">
        <span class="name">▶ ${m(t.phase)} ${t.phase}</span>
        <span class="role">${t.role} · intento ${t.attempt}/${t.maxAttempts} · ${t.model??`sesión`}</span>
      </div>
      <div class="bar"><i style="width:${r}%"></i></div>
      ${t.lastActivity?e`<div class="muted" style="font:.74rem var(--mono);margin-top:.3rem" title="última acción del agente">▸ ${t.lastActivity}</div>`:a}
      ${t.lastError?e`<div class="errline">${t.lastError}</div>`:a}
    </div>`}logBox(t){return e`<h2 class="sect">Registro</h2>
      <pre class="logpre">${(Array.isArray(t.logTail)?t.logTail:[]).join(`
`)||`—`}</pre>`}};d([u()],v.prototype,`apiBase`,void 0),d([u()],v.prototype,`change`,void 0),d([u()],v.prototype,`projId`,void 0),d([u()],v.prototype,`phaseId`,void 0),d([i()],v.prototype,`s`,void 0),d([i()],v.prototype,`err`,void 0),d([i()],v.prototype,`selected`,void 0),d([i()],v.prototype,`note`,void 0),d([i()],v.prototype,`hotModel`,void 0),d([i()],v.prototype,`models`,void 0),d([i()],v.prototype,`files`,void 0),d([i()],v.prototype,`busy`,void 0),d([i()],v.prototype,`actionErr`,void 0),d([i()],v.prototype,`archivedMsg`,void 0),d([i()],v.prototype,`stopping`,void 0),v=d([s(`run-screen`)],v);export{v as RunScreen};
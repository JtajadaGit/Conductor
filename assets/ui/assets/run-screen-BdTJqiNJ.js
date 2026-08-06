import{a as e,c as t,f as n,g as r,h as i,l as a,m as o,n as s,o as c,p as l,t as u,u as d,v as f}from"./index-BIRU5aZP.js";import"./status-pill-DbofWXSo.js";var p=class{constructor(e,t,n){this.base=e,this.onState=t,this.onError=n,this.timer=null,this.abort=null,this.lastHash=``,this.stopped=!0}start(){this.stopped=!1,this.lastHash=``,this.tick()}stop(){this.stopped=!0,this.timer!=null&&(clearTimeout(this.timer),this.timer=null),this.abort&&=(this.abort.abort(),null)}schedule(e){this.stopped||(this.timer=setTimeout(()=>void this.tick(),e))}async tick(){if(!this.stopped){this.abort=new AbortController;try{let e=await(await fetch(this.base+`state`,{signal:this.abort.signal})).json();if(this.stopped)return;if(!e||typeof e!=`object`||Array.isArray(e)){this.schedule(3e3);return}let t={...e,phases:Array.isArray(e.phases)?e.phases:[]},n=this.hashOf(t);if(n!==this.lastHash&&(this.lastHash=n,this.onState(t)),t.done){this.stop();return}this.schedule(t.pending?5e3:2e3)}catch(e){if(this.stopped)return;e.name!==`AbortError`&&this.onError?.(e),this.schedule(3e3)}}}hashOf(e){let{now:t,...n}=e;return JSON.stringify(n)}},m=class extends n{constructor(...e){super(...e),this.apiBase=`/api/`,this.phase=``,this.active=!1,this.text=``,this.loaded=!1}updated(e){this.active&&!this.loaded&&this.load()}async load(){if(!this.loaded){this.loaded=!0,this.text=`…`;try{let e=await(await fetch(this.apiBase+`raw?phase=`+encodeURIComponent(this.phase))).text();this.text=e&&e!==`no encontrado`?e.trim():`No se registró salida del modelo para esta fase.`}catch{this.text=`No se pudo cargar la salida del modelo.`}}}render(){return this.active?f`<pre class="rawpre tp-raw">${(this.text||`…`).trim()||`…`}</pre>`:f``}};d([o()],m.prototype,`apiBase`,void 0),d([o()],m.prototype,`phase`,void 0),d([o({type:Boolean})],m.prototype,`active`,void 0),d([l()],m.prototype,`text`,void 0),d([l()],m.prototype,`loaded`,void 0),m=d([i(`raw-output`)],m);var h=class extends n{constructor(...e){super(...e),this.cost=null}render(){let e=this.cost?.byModel;if(!e||!Object.keys(e).length)return r;let t=Object.values(e).reduce((e,t)=>e+(t.in||0),0)||1;return f`<h2 class="sect">Coste por modelo</h2>
      <div class="mb-list">
        ${Object.entries(e).map(([e,n])=>{let r=Math.max(0,Math.min(100,Math.round((Number(n.in)||0)/t*100)));return f`<div class="mb-row">
            <span class="mb-name" title=${e}>${e}</span>
            <span class="mb-track"><i style="width:${r}%"></i></span>
            <span class="mb-meta">${r}% · ↓${s(n.in)} ↑${s(n.out)} · ${n.phases} ${n.phases===1?`fase`:`fases`}</span>
          </div>`})}
      </div>`}};d([o({attribute:!1})],h.prototype,`cost`,void 0),h=d([i(`model-breakdown`)],h);var g=class extends n{constructor(...e){super(...e),this.apiBase=`/api/`,this.change=``,this.projId=``,this.phaseId=``,this.s=null,this.err=``,this.selected=new Set,this.note=``,this.hotModel=``,this.models=null,this.files=null,this.busy=``,this.actionErr=``,this.archivedMsg=``,this.tool={},this.redoTarget=``,this.redoErr=``,this.copiedReceipt=!1,this.filesSig=``,this.pendingKey=``,this.api=new t(`/api/`),this.poller=null,this.activeBase=``,this.stopping=!1}updated(e){this.apiBase&&this.apiBase!==this.activeBase&&(this.activeBase=this.apiBase,this.restart())}disconnectedCallback(){super.disconnectedCallback(),this.poller?.stop(),clearTimeout(this.receiptTimer),document.title=`conductor`}restart(){this.poller?.stop(),this.s=null,this.err=``,this.files=null,this.filesSig=``,this.stopping=!1,this.pendingKey=``,this.selected=new Set,this.note=``,this.hotModel=``,this.redoTarget=``,this.redoErr=``,this.api=new t(this.apiBase),this.poller=new p(this.apiBase,e=>{e.done&&(this.stopping=!1);let t=e.pending?`${e.pending.before}|${(e.pending.findings||[]).length}`:``;t!==this.pendingKey&&(this.pendingKey=t,t&&(this.selected=new Set,this.note=``,this.hotModel=``,this.redoTarget=``,this.redoErr=``)),this.s=e,this.maybeFetchFiles(e),document.title=e.pending?`⏸ tu decisión — conductor`:`conductor`},e=>{this.err=e.message}),this.poller.start(),new t(`/api/`).models().then(e=>{this.models=e}).catch(()=>{})}async maybeFetchFiles(e){let t=(e.verdict??``)+`|`+e.phases.filter(e=>e.ok).length;if(t!==this.filesSig)try{this.files=await this.api.runFiles(),this.filesSig=t}catch{}}hotModelSelect(){let e=this.models,t=e?.copilot??[],n=e?.byok??[],r=!!e?.byokCreds;return f`<label class="fl">Modelo de esta fase<select .value=${this.hotModel} title=${e?`Copilot: ${e.copilotSource} · LiteLLM: ${e.byokSource}`:``} @change=${e=>{this.hotModel=e.target.value}}>
      <option value="">Mantener el actual</option>
      ${t.length?f`<optgroup label="Copilot${e?.copilotPending?` · vistos en tus runs`:``}">${t.map(e=>f`<option value="copilot:${e}">${e}</option>`)}</optgroup>`:f`<option value="" disabled>catálogo Copilot aún no disponible</option>`}
      ${r&&n.length?f`<optgroup label="LiteLLM · conectado">${n.map(t=>f`<option value="byok:${t}">${e?.names?.[t]??t}</option>`)}</optgroup>`:f`<option value="" disabled>LiteLLM: ${r?`catálogo vacío (¿key rechazada? mira el panel)`:`sin conectar — crea ~/.conductor/litellm.json (el panel te dice cómo)`}</option>`}
    </select></label>`}async approve(e){this.busy=`approve`,this.actionErr=``;try{let t=await this.api.continue({selected:e?[...this.selected]:void 0,note:this.note||void 0,model:this.hotModel||void 0});if(!t.ok){this.actionErr=t.error||`no se pudo aprobar — reintenta o detén el run`;return}this.note=``,this.hotModel=``,this.selected=new Set,this.s&&={...this.s,pending:null}}finally{this.busy=``}}redoOptions(e){let t=[`explore`,`propose`,`clarify`,`spec`,`design`,`tasks`],n=new Set(e.phases.filter(e=>e.ok).map(e=>e.phase));return t.filter(e=>n.has(e))}async redoPhase(){if(!this.redoTarget){this.redoErr=`elige la fase que quieres rehacer`;return}if(!this.note.trim()){this.redoErr=`escribe la instrucción para rehacer`;return}this.busy=`redo`,this.actionErr=``,this.redoErr=``;try{let e=await this.api.continue({redo:this.redoTarget,note:this.note});if(!e.ok){this.actionErr=e.error||`no se pudo rehacer la fase — reintenta o detén el run`;return}this.note=``,this.hotModel=``,this.selected=new Set,this.redoTarget=``,this.s&&={...this.s,pending:null}}finally{this.busy=``}}async copyReceipt(){this.busy=`receipt`,this.actionErr=``;try{let e=await fetch(this.apiBase+`receipt`),t=await e.json().catch(()=>null);if(!e.ok||!t?.ok||typeof t.markdown!=`string`){this.actionErr=t?.error||`no se pudo obtener la descripción de PR (HTTP ${e.status})`;return}await this.copyText(t.markdown),this.copiedReceipt=!0,clearTimeout(this.receiptTimer),this.receiptTimer=setTimeout(()=>{this.copiedReceipt=!1},2e3)}catch(e){this.actionErr=`no se pudo copiar la descripción de PR — `+e.message}finally{this.busy=``}}async copyText(e){try{await navigator.clipboard.writeText(e)}catch{let t=document.createElement(`textarea`);t.value=e,t.setAttribute(`readonly`,``),t.style.position=`fixed`,t.style.opacity=`0`,document.body.appendChild(t),t.select();try{if(!document.execCommand(`copy`))throw Error(`el navegador rechazó la copia`)}finally{t.remove()}}}async resumeRun(){this.busy=`resume`,this.actionErr=``;try{let e=await this.api.resume();if(!e.ok){this.actionErr=e.error||`no se pudo reanudar`;return}this.restart()}finally{this.busy=``}}async archiveRun(){if(confirm(`¿Archivar este change? Se promueve la spec a la fuente de verdad y el change pasa al histórico. Tu código no se toca.`)){this.busy=`archive`,this.actionErr=``;try{let e=await this.api.archiveRun();if(!e.ok){this.actionErr=e.error||`no se pudo archivar`;return}let t=e.needsManualMerge?.length??0,n=t?` · ${t} spec${t===1?``:`s`} ${t===1?`requiere`:`requieren`} merge manual (cambios no aditivos)`:``,r=e.promoted?.length??0;this.archivedMsg=`Archivado. ${r} spec${r===1?``:`s`} ${r===1?`promovida`:`promovidas`}${n}.`}finally{this.busy=``}}}toggleSel(e,t){let n=new Set(this.selected);t?n.add(e):n.delete(e),this.selected=n}async stopRun(){let e=this.s?.pending??null;this.stopping=!0,this.actionErr=``,this.s&&={...this.s,pending:null};try{let t=await this.api.stop();t.ok||(this.actionErr=t.error||`no se pudo detener`,this.stopping=!1,this.s&&={...this.s,pending:e})}catch{this.actionErr=`no se pudo detener`,this.stopping=!1,this.s&&={...this.s,pending:e}}}async rollback(e){if(confirm(`¿Deshacer "${e}"? Se restaurarán los archivos al estado previo a esta fase. La rama de git no se modifica.`)){this.busy=`rollback`,this.actionErr=``;try{let t=await this.api.rollback(e);t.ok||(this.actionErr=t.error||`no se pudo deshacer`)}finally{this.busy=``}}}viewDiff(e){document.dispatchEvent(new CustomEvent(`cdr-view`,{detail:{apiBase:this.apiBase,kind:`diff`,path:e}}))}viewArtifact(e){document.dispatchEvent(new CustomEvent(`cdr-view`,{detail:{apiBase:this.apiBase,kind:`art`,path:e}}))}runPath(){return location.pathname.replace(/\/+$/,``)}dashboardHref(){return this.projId?`/artifact/${this.projId}/${this.change}/dashboard.html`:`/artifact/${this.change}/dashboard.html`}sessionHref(){return this.projId?`/session/${this.projId}/${this.change}`:`/session/${this.change}`}sign(e){return e===`create`?`+`:e===`delete`?`−`:`±`}render(){if(this.err&&!this.s)return f`<p class="errline" role="alert">Error: ${this.err}</p>`;let e=this.s;if(!e)return a(`Cargando run`,!0);let t=this.apiBase.includes(`/demo`),n=e;return n.missing?f`
        <div class="apphdr"><h1 class="trunc">${this.change||`run`}</h1></div>
        ${n.archivedAs?f`<p class="alert info" role="status"><span>Este cambio está <b>archivado</b> como <code>${n.archivedAs}</code> — su spec ya vive en la fuente de verdad (<code>openspec/specs/</code>) y su evidencia en <code>.conductor/runs/archive/</code>. <a class="lnk" href="/">Volver al panel</a></span></p>`:f`<p class="alert warn" role="status"><span>Este cambio <b>no existe</b> en el proyecto en foco — revisa la URL o vuelve al panel. <a class="lnk" href="/">Volver al panel</a></span></p>`}
      `:f`
      ${t?f`<p class="alert info" role="note" style="margin-bottom:1rem"><span><b>Demo</b> — pantalla de muestra con datos ficticios (modelos, cambios y coste no son reales). <a class="lnk" href="/">Ir a tu panel</a></span></p>`:r}
      <div class="apphdr">
        <h1 class="trunc">${this.change||e.project||`run`}</h1>
        ${e.branch?f`<span class="chip-branch" title="rama de git del proyecto">⎇ ${e.branch}</span>`:r}
        <span role="status" aria-live="polite"><status-pill .verdict=${e.pending?`EN PAUSA`:e.verdict??`EN CURSO`}></status-pill></span>
      </div>
      <p class="subhead">${e.project||`—`}</p>
      <div class="actbar">
        <a class="btn sm sec" href=${this.sessionHref()} title="La traza del agente paso a paso: qué tools usó, qué permisos pidió, hooks y modelos de la sesión del CLI. Lectura local — 0 tokens.">${u(`session`)} Ver sesión</a>
        ${(e.done||e.verdict===`INTERRUMPIDO`)&&c(e.verdict)!==`GREEN`?f`<button class="btn sm resume" ?disabled=${this.busy===`resume`} @click=${()=>void this.resumeRun()} title=${e.verdict===`INTERRUMPIDO`?`El proceso del run murió sin cerrar (¿equipo suspendido / terminal cerrada?) — reanuda desde la última fase completada`:`reanudar el run`}>${this.busy===`resume`?`Reanudando…`:f`${u(`play`)} Reanudar`}</button>`:r}
        ${e.done&&c(e.verdict)===`GREEN`&&!this.archivedMsg?f`<button class="btn sm arch" ?disabled=${this.busy===`archive`} @click=${()=>void this.archiveRun()}>${this.busy===`archive`?`Archivando…`:f`${u(`archive`)} Archivar`}</button>`:r}
        ${e.done&&c(e.verdict)===`GREEN`?f`<button class="btn sm sec" ?disabled=${this.busy===`receipt`} aria-live="polite" @click=${()=>void this.copyReceipt()}>${this.copiedReceipt?`Copiado ✓`:this.busy===`receipt`?`Copiando…`:f`${u(`copy`)} Copiar descripción de PR`}</button>`:r}
        ${e.hasDashboard?f`<a class="btn sm sec" href=${this.dashboardHref()} target="_blank" title="Informe del run para compartir: fases con modelo, tiempos, intentos y tokens reales vs estimados, el gate y el linaje requisito→código→test. Se archiva con el cambio como evidencia.">${u(`report`)} Informe</a>`:r}
        <a class="btn sm sec" href=${this.apiBase+`aiact`} target="_blank" title="El acta de «quién hizo qué» que pide el reglamento europeo de IA: ficheros escritos por la IA, modelo y papel de cada agente, aprobaciones humanas y sello. No es el sello de calidad (eso es GREEN, el veredicto SDD del run). Cuándo aplica y cuándo no: en Ayuda.">${u(`shield`)} AI Act</a>
        ${e.done?r:f`<button class="btn sm stop" ?disabled=${e.stopRequested||this.stopping} @click=${()=>void this.stopRun()}>${e.stopRequested||this.stopping?`Deteniendo…`:f`${u(`stop`)} Detener`}</button>`}
      </div>
      <!-- FUERA de .actbar: dentro era un item flex más y partía la barra de botones en dos filas -->
      ${e.verdict===`INTERRUMPIDO`?f`<p class="alert warn" role="status"><span>Run <b>interrumpido</b>: el proceso murió sin cerrar (¿equipo suspendido?). Nada se ha perdido — <b>↻ Reanudar</b> continúa desde la última fase completada.</span></p>`:r}
      ${this.actionErr?f`<div class="errline" role="alert">${this.actionErr}</div>`:r}
      ${this.archivedMsg?f`<div class="whybox ok" role="status">${this.archivedMsg} <a href="/">Volver al panel</a></div>`:r}
      ${e.done&&e.verdict?this.verdictBanner(e):r}
      ${e.tests?.ran?f`<div class="muted" style="margin:.1rem 0 .9rem;font-size:.82rem">Pruebas del proyecto (antes de verify): ${e.tests.passed?f`<span style="color:var(--ok);font-weight:600">✓ pasaron</span>`:f`<span style="color:var(--warn);font-weight:600">✗ fallaron</span>`} <code style="font-size:.85em">${e.tests.cmds.join(` · `)}</code>${!e.tests.passed&&e.tests.failed.length?f` <span class="muted">— falló: ${e.tests.failed.join(`, `)}</span>`:r}</div>`:r}
      ${e.done?(()=>{let t=this.reviewArtifacts(e);return t.length?f`<div class="decision-arts" style="margin:0 0 .9rem"><span class="ctx-lbl">Artefactos</span>${t.map(e=>f`<button type="button" class="lnk" title="abrir ${e.path} (editable)" @click=${()=>this.viewArtifact(e.path)}>${u(`doc`)} ${e.label}</button>`)}<button type="button" class="lnk" title="abrir verify-report.md" @click=${()=>this.viewArtifact(`verify-report.md`)}>${u(`doc`)} verify-report.md</button>${this.specDomain(e)?f`<button type="button" class="lnk" title="diff del delta contra la spec viva promovida" @click=${()=>this.viewSpecDiff(this.specDomain(e))}>± vs spec viva</button>`:r}</div>`:r})():r}
      ${this.requestBox(e)}
      ${this.phaseId?this.phaseDetail(e):r}
      ${e.pending?this.pendingCard(e.pending,e):r}
      ${this.cards(e)}
      ${this.pipeline(e)}
      ${this.changesSection()}
      ${e.cost?f`<model-breakdown .cost=${e.cost}></model-breakdown>`:r}
      ${this.logBox(e)}
    `}verdictBanner(e){let t=e.gate??null;return c(e.verdict)===`GREEN`?f`<p class="alert ok" role="status"><span><b>GREEN</b> — verificado: la spec, el código y los tests son coherentes y la revisión pasó.
        ${t?.warnings?f` <b>${t.warnings} aviso(s)</b> sin bloqueo — el detalle, en el gate del Informe.`:r}
        Listo para que revises el diff y hagas commit.</span></p>`:f`<div class="alert warn" role="alert"><span><b>${e.verdict}</b> — ${e.reason||`terminó con huecos concretos sin resolver.`}
      ${t?.top?.length?f`<ul class="why-lst">${t.top.map(e=>f`<li>${e}</li>`)}${t.blocking>t.top.length?f`<li>…y ${t.blocking-t.top.length} más (gate del Informe)</li>`:r}</ul>`:r}
      <span class="muted">No se ha perdido nada: corrige lo de arriba (o pide otro intento con una nota) y <b>↻ Reanudar</b> continúa donde quedó.</span></span></div>`}requestBox(e){return f`<details class="req" ?open=${!(e.request&&e.request.length>90)}>
      <summary class="req-sum"><span class="req-lbl">Prompt</span><span class="req-badge">${e.complexity}${e.resumed?` · reanudado`:``}</span></summary>
      <p class="req-body">${e.request}</p>
    </details>`}phaseDetail(t){let n=t.phases.find(e=>e.phase===this.phaseId);return n?f`<div class="ph">
      <div class="row">
        <span class="name">Detalle: ${n.phase}</span>
        <span class="role">${n.role}</span>
        <span class="right">${e(n.ms)} · ↓${s(n.tokens?.in)} ↑${s(n.tokens?.out)}</span>
      </div>
      <div class="tpanel">${this.filesPanel(n.files)}</div>
      ${n.hasRaw?f`<raw-output .apiBase=${this.apiBase} .phase=${n.phase}></raw-output>`:r}
      <div style="margin-top:var(--sp-2)"><a class="btn sm sec" href=${this.runPath()}>← volver</a></div>
    </div>`:r}specDomain(e){for(let t of e.phases){if(t.phase!==`spec`||!Array.isArray(t.files))continue;let e=t.files.find(e=>/specs[\\/].+[\\/]spec\.md$/i.test(e.p));if(e){let t=e.p.replace(/\\/g,`/`).match(/specs\/([^/]+)\/spec\.md$/i);if(t)return t[1]}}return null}viewSpecDiff(e){document.dispatchEvent(new CustomEvent(`cdr-view`,{detail:{apiBase:this.apiBase,kind:`specdiff`,path:e}}))}reviewArtifacts(e){let t={explore:`exploration.md`,propose:`proposal.md`,clarify:`questions.md`,design:`design.md`,tasks:`tasks.md`,apply:`apply-report.md`},n=[];for(let r of e.phases)if(r.ok)if(r.phase===`spec`){let e=Array.isArray(r.files)?r.files.find(e=>/specs[\\/].+[\\/]spec\.md$/i.test(e.p)):void 0,t=e?e.p.replace(/\\/g,`/`).replace(/^.*openspec\/changes\/[^/]+\//,``):``;t&&t.startsWith(`specs/`)&&n.push({label:`spec.md`,path:t})}else t[r.phase]&&n.push({label:t[r.phase],path:t[r.phase]});return n.filter((e,t)=>n.findIndex(t=>t.path===e.path)===t)}pendingCard(e,t){let n=this.reviewArtifacts(t),i=(e.findings??[]).map(e=>typeof e==`string`?{message:e}:e),a=this.selected.size,o=e=>e===`error`||e===`breaking`,s=e.before===`fix`?[]:this.redoOptions(t);return f`<section class="decision">
      <header class="decision-head">
        <span class="decision-led" aria-hidden="true"></span>
        <div class="decision-titles">
          <h2 class="decision-title">Decisión del revisor</h2>
          <span class="decision-sub" role="status" aria-live="polite">Antes de <b>${e.before}</b> · ${i.length?`selecciona los hallazgos a corregir o ajusta la fase`:`revisa y aprueba para continuar`}</span>
        </div>
      </header>
      <div class="decision-body">
        ${n.length?f`<div class="decision-arts"><span class="ctx-lbl">Revisar</span>${n.map(e=>f`<button type="button" class="lnk" title="abrir ${e.path} (editable)" @click=${()=>this.viewArtifact(e.path)}>${u(`doc`)} ${e.label}</button>`)}${this.specDomain(this.s)?f`<button type="button" class="lnk" title="diff del delta contra la spec viva promovida" @click=${()=>this.viewSpecDiff(this.specDomain(this.s))}>± vs spec viva</button>`:r}</div>`:r}
        ${i.length?f`<ul class="decision-findings">${i.map((e,t)=>f`
          <li>
            <label><input type="checkbox" .checked=${this.selected.has(t)} @change=${e=>this.toggleSel(t,e.target.checked)}>
              <span class="fnd">${e.severity?f`<span class="sev ${o(e.severity)?`error`:`aviso`}">${o(e.severity)?`error`:`aviso`}</span>`:r}${e.message}</span></label>
            ${e.file?/\.(md|txt)$/.test(e.file)?f`<button type="button" class="lnk fnd-file" title="ver ${e.file}" @click=${()=>this.viewArtifact(e.file)}>${e.file}</button>`:f`<code class="fnd-file">${e.file}</code>`:r}
          </li>`)}</ul>`:r}
        <div class="decision-form">
          <label class="fl df-note"><span>Instrucción para esta fase <span class="opt">· opcional</span></span>
            <textarea class="pend-note" rows="2" .value=${this.note} @input=${e=>{this.note=e.target.value}} placeholder="p. ej. «usa el servicio de auth existente, no crees otro»" aria-describedby=${s.length?`df-help`:r}></textarea>
            ${s.length?f`<span class="df-help" id="df-help">Con <b>Aprobar</b> viaja a <b>${e.before}</b> · con <b>Rehacer</b> viaja a la fase de planificación que elijas (las posteriores se regeneran y el run vuelve a pausar aquí).</span>`:r}
          </label>
          ${this.hotModelSelect()}
        </div>
        <div class="decision-actions">
          <button class="approve" ?disabled=${this.busy===`approve`} @click=${()=>void this.approve(a>0)}>${this.busy===`approve`?`Enviando…`:a>0?`Corregir ${a} hallazgo${a===1?``:`s`}`:`Aprobar y continuar`}</button>
          ${s.length?f`<div class="redo-inline">
            <select aria-label="fase de planificación a rehacer" .value=${this.redoTarget} @change=${e=>{this.redoTarget=e.target.value,this.redoErr=``}}>
              <option value="">Rehacer fase…</option>
              ${s.map(e=>f`<option value=${e}>${e}</option>`)}
            </select>
            <button type="button" class="redo-btn" ?disabled=${this.busy!==``} @click=${()=>void this.redoPhase()}>${this.busy===`redo`?`Rehaciendo…`:`↺ Rehacer`}</button>
          </div>`:r}
        </div>
        ${this.redoErr?f`<span class="errline redo-err" role="alert">${this.redoErr}</span>`:r}
      </div>
    </section>`}cards(t){let n=t.phases.filter(e=>e.ok).length,i=t.plan?.length||t.phases.length,a=t.phases.reduce((e,t)=>e+(t.tokens?.in??0),0),o=t.phases.reduce((e,t)=>e+(t.tokens?.out??0),0),c=t.phases.reduce((e,t)=>e+(t.files?.length??0),0),l=t.ghUsage,u=t.savings;return f`<div class="statline" role="status" aria-label="resumen del run">
      <span><b>${n}/${i}</b> fases</span>
      <span>${e(t.total_ms??(t.current?t.now-t.current.startedAt:null))}</span>
      ${a+o>0?f`<span title="tokens de entrada/salida acumulados">↓${s(a)} ↑${s(o)}</span>`:r}
      ${c?f`<span>${c} fichero${c===1?``:`s`}</span>`:r}
      ${u&&u.byok_phases>0?f`<span class="st-ok" title="fases vía LiteLLM — 0 AI Credits (↓${s(u.byok_in)} ↑${s(u.byok_out)} tokens fuera de Copilot)">LiteLLM ${u.byok_phases}/${u.byok_phases+u.copilot_phases} · 0 AIC</span>`:r}
      ${l?f`<span title="AI Credits de tu cuenta Copilot">AIC ${l.used}/${l.entitlement}</span>`:r}
    </div>`}changesSection(){let e=this.files;if(!Array.isArray(e?.files)||!e.files.length)return r;let t=e.totals;return f`
      <div class="sectrow"><h2 class="sect">Cambios</h2>${e.fromGit?r:f`<span class="muted" style="font-size:.72rem">aprox. (sin git)</span>`}</div>
      <div class="changes">
        <div class="changes-head">
          <span class="ch-n">${t.files} fichero${t.files===1?``:`s`}</span>
          <span class="ch-stat"><span class="ch-add">+${s(t.added)}</span><span class="ch-del">−${s(t.removed)}</span></span>
        </div>
        <ul class="ch-list">
          ${e.files.map(e=>f`<li class="ch-row">
            <span class="k ${e.k}" title=${e.k}>${this.sign(e.k)}</span>
            <button class="ch-path" @click=${()=>this.viewDiff(e.p)} title="ver diff de ${e.p}">${e.p}</button>
            ${e.added==null?r:f`<span class="ch-rstat"><span class="ch-add">+${e.added}</span><span class="ch-del">−${e.removed}</span></span>`}
          </li>`)}
        </ul>
      </div>`}pipeline(e){let t=new Set(e.phases.map(e=>e.phase)),n=(Array.isArray(e.plan)?e.plan:[]).filter(n=>!t.has(n)&&(!e.current||e.current.phase!==n));return f`<h2 class="sect">Pipeline</h2>
      <div class="rail">
        ${e.phases.map((e,t)=>this.phaseCard(e,t))}
        ${e.current?this.currentCard(e.current,e.now):r}
        ${n.map(e=>f`<div class="ph todo"><div class="row"><span class="name muted">○ ${e}</span></div></div>`)}
      </div>
    `}filesPanel(e){return!Array.isArray(e)||!e.length?r:f`<ul class="tp-files">
      ${e.map(e=>f`<li><span class="k ${e.k}">${this.sign(e.k)}</span> <button class="lnk" @click=${()=>this.viewDiff(e.p)}>${e.p}</button></li>`)}
    </ul>`}hasCtx(e){let t=e.context;return!!t&&(Array.isArray(t.instructions)&&t.instructions.length>0||Array.isArray(t.contextFiles)&&t.contextFiles.length>0)}ctxPanel(e){let t=e.context;if(!t)return r;let n=Array.isArray(t.instructions)?t.instructions:[],i=Array.isArray(t.contextFiles)?t.contextFiles:[];return f`
      ${n.length?f`<div class="ctx-row"><span class="ctx-lbl">Instrucciones</span><span class="ctx-chips">${n.map(e=>f`<code class="ctx-chip">${e.split(`/`).pop()}</code>`)}</span></div>`:r}
      ${i.length?f`<div class="ctx-row"><span class="ctx-lbl">Archivos</span><span class="ctx-chips">${i.map(e=>f`<code class="ctx-chip">${e}</code>`)}</span></div>`:r}`}toggleTool(e,t){this.tool={...this.tool,[e]:this.tool[e]===t?``:t}}tchip(e,t,n){let r=t===`files`?`doc`:t===`ctx`?`eye`:`terminal`,i=this.tool[e]===t;return f`<button type="button" class="tchip ${i?`on`:``}" aria-pressed=${i} @click=${()=>this.toggleTool(e,t)}>${u(r)} ${n}</button>`}estFor(e){let t=this.s?.estimate?.phases;if(!Array.isArray(t))return null;let n=t.find(t=>t.phase===e);return n?{estIn:n.estIn,estOut:n.estOut}:null}phaseCard(t,n=0){let i=`${n}:${t.phase}`,a=this.tool[i]||``;return f`<div class="ph ${t.ok?`done`:`bad`}">
      <div class="row">
        <span class="name"><a href="${this.runPath()}?phase=${t.phase}">${t.phase}</a></span>
        <span class="role">${t.role}</span>
        ${t.model?f`<span class="badge prov-${t.provider??`none`}">${t.model}</span>`:r}
        ${t.modelMismatch?f`<span class="badge warn" title="pedido ${t.modelRequested??`?`} → el proveedor reportó ${t.modelReported??`?`}">${u(`warn`)} modelo</span>`:r}
        ${t.fallback?f`<span class="badge warn" title="pedido ${t.fallback.from} → reserva ${t.fallback.to} tras ${t.fallback.afterKind} (opt-in fallback)">${u(`buoy`)} fallback</span>`:r}
        ${t.attempts>1?f`<span class="badge">${t.attempts}×</span>`:r}
        ${Array.isArray(t.lenses)&&t.lenses.length?f`<span class="badge" title="verify revisó en PARALELO con ${t.lenses.length} lentes independientes (${t.lenses.join(`, `)}) y fusionó sus hallazgos">${t.lenses.length} lentes</span>`:r}
        ${t.resumed?f`<span class="badge" title="fase completada en el run anterior (interrumpido/reanudado) — se reutiliza su artefacto SIN volver a pagarla">${u(`redo`)} heredada</span>`:r}
        <span class="right"><b class="ph-time">${e(t.ms)}</b>${t.tokens?f`<span class="ph-real" title="tokens reales de la fase">↓${s(t.tokens.in)} ↑${s(t.tokens.out)}</span>`:r}${this.estFor(t.phase)?f`<span class="ph-est" title="estimación preflight (sin gastar API)">est ↓${s(this.estFor(t.phase).estIn)} ↑${s(this.estFor(t.phase).estOut)}</span>`:r}</span>
      </div>
      <!-- TABS FIJOS de la tarjeta (interactuar no debe desplazar nada): los botones
           JAMÁS se mueven; el contenido vive en UN panel único debajo que solo intercambia contenido. -->
      <div class="ph-tools" role="tablist" aria-label="detalle de la fase ${t.phase}">
        ${Array.isArray(t.files)&&t.files.length?this.tchip(i,`files`,`${t.files.length} ${t.files.length===1?`fichero`:`ficheros`}`):r}
        ${this.hasCtx(t)?this.tchip(i,`ctx`,`contexto del agente`):r}
        ${t.hasRaw?this.tchip(i,`raw`,`salida del modelo`):r}
        ${t.phase===`apply`||t.phase===`fix`?f`<button class="rollbtn" ?disabled=${this.busy===`rollback`} @click=${()=>void this.rollback(t.phase)} title="restaura tu árbol al checkpoint previo a esta fase">${this.busy===`rollback`?`Deshaciendo…`:f`${u(`undo`)} Deshacer`}</button>`:r}
      </div>
      ${a?f`<div class="tpanel">${a===`files`?this.filesPanel(t.files):a===`ctx`?this.ctxPanel(t):f`<raw-output active .apiBase=${this.apiBase} .phase=${t.phase}></raw-output>`}</div>`:r}
      ${t.lastError?f`<div class="errline">${t.lastError}</div>`:r}
    </div>`}currentCard(e,t){let n=e.timeoutMs?Math.min(95,Math.round((t-e.startedAt)/e.timeoutMs*100)):40;return f`<div class="ph now">
      <div class="row">
        <span class="name">▶ ${e.phase}</span>
        <span class="role">${e.role} · intento ${e.attempt}/${e.maxAttempts} · ${e.model??`sesión`}</span>
      </div>
      <div class="bar"><i style="width:${n}%"></i></div>
      ${e.lastActivity?f`<div class="muted" style="font:.74rem var(--mono);margin-top:.3rem" title="última acción del agente">▸ ${e.lastActivity}</div>`:r}
      ${e.lastError?f`<div class="errline">${e.lastError}</div>`:r}
    </div>`}logBox(e){return f`<h2 class="sect">Registro</h2>
      <pre class="logpre">${(Array.isArray(e.logTail)?e.logTail:[]).join(`
`)||`—`}</pre>`}};d([o()],g.prototype,`apiBase`,void 0),d([o()],g.prototype,`change`,void 0),d([o()],g.prototype,`projId`,void 0),d([o()],g.prototype,`phaseId`,void 0),d([l()],g.prototype,`s`,void 0),d([l()],g.prototype,`err`,void 0),d([l()],g.prototype,`selected`,void 0),d([l()],g.prototype,`note`,void 0),d([l()],g.prototype,`hotModel`,void 0),d([l()],g.prototype,`models`,void 0),d([l()],g.prototype,`files`,void 0),d([l()],g.prototype,`busy`,void 0),d([l()],g.prototype,`actionErr`,void 0),d([l()],g.prototype,`archivedMsg`,void 0),d([l()],g.prototype,`tool`,void 0),d([l()],g.prototype,`redoTarget`,void 0),d([l()],g.prototype,`redoErr`,void 0),d([l()],g.prototype,`copiedReceipt`,void 0),d([l()],g.prototype,`stopping`,void 0),g=d([i(`run-screen`)],g);export{g as RunScreen};
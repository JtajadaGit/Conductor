import{_ as e,c as t,d as n,f as r,g as i,h as a,i as o,m as s,n as c,o as l,p as u,r as d,t as f,u as p,v as m}from"./index-fjvY05wc.js";import"./status-pill-wNwCldrq.js";var h={ATTRIBUTE:1,CHILD:2,PROPERTY:3,BOOLEAN_ATTRIBUTE:4,EVENT:5,ELEMENT:6},g=e=>(...t)=>({_$litDirective$:e,values:t}),_=class{constructor(e){}get _$AU(){return this._$AM._$AU}_$AT(e,t,n){this._$Ct=e,this._$AM=t,this._$Ci=n}_$AS(e,t){return this.update(e,t)}update(e,t){return this.render(...t)}},{I:v}=m,y=e=>e.strings===void 0,b={},x=(e,t=b)=>e._$AH=t,S=g(class extends _{constructor(e){if(super(e),e.type!==h.PROPERTY&&e.type!==h.ATTRIBUTE&&e.type!==h.BOOLEAN_ATTRIBUTE)throw Error("The `live` directive is not allowed on child or event bindings");if(!y(e))throw Error("`live` bindings can only contain a single expression")}render(e){return e}update(e,[t]){if(t===i||t===a)return t;let n=e.element,r=e.name;if(e.type===h.PROPERTY){if(t===n[r])return i}else if(e.type===h.BOOLEAN_ATTRIBUTE){if(!!t===n.hasAttribute(r))return i}else if(e.type===h.ATTRIBUTE&&n.getAttribute(r)===t+``)return i;return x(e),t}}),C=class extends n{constructor(...e){super(...e),this.value=``,this.projId=``,this.placeholder=``,this.rows=3,this.open=!1,this.items=[],this.index=0,this.kind=`@`,this.query=``,this.tokStart=0,this.timer=0,this.seq=0,this.pendingCaret=null,this.skillsCache=null,this.skillsCacheProj=``}disconnectedCallback(){super.disconnectedCallback(),clearTimeout(this.timer)}emit(e){this.dispatchEvent(new CustomEvent(`cdr-input`,{detail:{value:e},bubbles:!0,composed:!0}))}close(){this.open=!1,this.items=[],clearTimeout(this.timer)}onInput(e){let t=e.target;this.emit(t.value);let n=t.value.slice(0,t.selectionStart).match(/(^|\s)(?:@([^\s@]*)|\/([^\s@/]*))$/);if(!n){this.close();return}let r=n[2]!==void 0;this.kind=r?`@`:`/`,this.query=r?n[2]:n[3],this.tokStart=t.selectionStart-this.query.length-1,this.open=!0,this.index=0,clearTimeout(this.timer),this.timer=window.setTimeout(()=>void this.fetchItems(),130)}async fetchItems(){let e=++this.seq,t=this.projId;try{let n=new URLSearchParams;if(t&&n.set(`project`,t),this.kind===`@`){n.set(`q`,this.query);let t=await(await fetch(`/api/files?`+n)).json();if(e!==this.seq)return;this.items=(t.files||[]).slice(0,30).map(e=>({v:e,label:e}))}else{if((!this.skillsCache||this.skillsCacheProj!==t)&&(this.skillsCache=(await(await fetch(`/api/skills?`+n)).json()).skills||[],this.skillsCacheProj=t),e!==this.seq)return;let r=this.query.toLowerCase();this.items=(this.skillsCache||[]).filter(e=>!r||e.name.toLowerCase().includes(r)).slice(0,20).map(e=>({v:e.name,label:e.name,sub:e.title}))}this.index=0}catch{this.items=[]}}onKey(e){this.open&&(e.key===`ArrowDown`?(e.preventDefault(),this.items.length&&(this.index=(this.index+1)%this.items.length)):e.key===`ArrowUp`?(e.preventDefault(),this.items.length&&(this.index=(this.index-1+this.items.length)%this.items.length)):(e.key===`Enter`||e.key===`Tab`)&&this.items.length?(e.preventDefault(),this.insert(this.items[this.index])):e.key===`Escape`&&(e.preventDefault(),this.close()))}insert(e){let t=this.querySelector(`textarea`);if(!t)return;let n=t.selectionStart,r=this.kind===`@`&&/\s/.test(e.v)?`"`+e.v+`"`:e.v,i=this.kind+r,a=t.value.slice(0,this.tokStart)+i+` `+t.value.slice(n),o=this.tokStart+i.length+1;this.value=a,this.pendingCaret=o,this.emit(a),this.close()}updated(){if(this.pendingCaret==null)return;let e=this.querySelector(`textarea`);e&&(e.focus(),e.setSelectionRange(this.pendingCaret,this.pendingCaret)),this.pendingCaret=null}render(){return e`
      <div class="mi-wrap">
        <textarea class="mi-ta" rows=${this.rows} placeholder=${this.placeholder} .value=${S(this.value)} required
          role="combobox" aria-autocomplete="list" aria-expanded=${this.open?`true`:`false`}
          aria-controls="mi-menu" aria-activedescendant=${this.open&&this.items.length?`mi-opt-`+this.index:a}
          @input=${e=>this.onInput(e)} @keydown=${e=>this.onKey(e)}
          @blur=${()=>{this.timer=window.setTimeout(()=>{this.open=!1},130)}}></textarea>
        ${this.open?e`
          <ul id="mi-menu" class="mi-menu" role="listbox" aria-label=${this.kind===`@`?`ficheros`:`skills`}>
            <li class="mi-head">${this.kind===`@`?`FICHERO PARA CONTEXTO`:`SKILL DEL EQUIPO`}</li>
            ${this.items.length?this.items.map((t,n)=>e`
              <li id=${`mi-opt-`+n} role="option" aria-selected=${n===this.index?`true`:`false`} class="mi-item ${n===this.index?`on`:``}"
                @mousemove=${()=>{this.index=n}} @mousedown=${e=>{e.preventDefault(),this.insert(t)}}>
                <span class="mi-trig">${this.kind}</span><span class="mi-lbl">${t.label}</span>${t.sub?e`<span class="mi-sub">${t.sub}</span>`:a}
              </li>`):e`<li class="mi-empty">Sin resultados para "${this.query}"</li>`}
          </ul>`:a}
      </div>`}};f([u()],C.prototype,`value`,void 0),f([u()],C.prototype,`projId`,void 0),f([u()],C.prototype,`placeholder`,void 0),f([u({type:Number})],C.prototype,`rows`,void 0),f([r()],C.prototype,`open`,void 0),f([r()],C.prototype,`items`,void 0),f([r()],C.prototype,`index`,void 0),C=f([s(`mention-input`)],C);var w={explore:{artifact:`exploration.md`},propose:{artifact:`proposal.md`},clarify:{artifact:`questions.md`},spec:{artifact:`spec.md`,gate:`estructura + escenarios`},design:{artifact:`design.md`},tasks:{artifact:`tasks.md`},apply:{artifact:`código + tests`,gate:`secretos · trazabilidad`},verify:{artifact:`verify-report.md`,gate:`gate determinista (innegociable)`},fix:{artifact:`apply-report.md`}},T=[`explore`,`propose`,`clarify`,`spec`,`design`,`tasks`,`apply`,`verify`],E=[`spec`,`apply`,`verify`],D=class extends n{constructor(...e){super(...e),this.projects=[],this.gh=null,this.usage=null,this.version=``,this.models=null,this.req=``,this.name=``,this.complexity=`medium`,this.auto=!1,this.projId=``,this.mPlanner=``,this.mCoder=``,this.mReviewer=``,this.preset=``,this.busy=!1,this.error=``,this.atts=[],this.savingDefaults=!1,this.saveDefaultsMsg=``,this.est=null,this.phaseSel=[],this.runTests=!1,this.initBusy=!1,this.initMsg=``,this.pipelineTouched=!1,this.estSeq=0,this.proposedPlan=[],this.q=``,this.hits=[],this.archived=[],this.defProjId=``,this.estTimer=null,this.searchTimer=null,this.liveTimer=null,this.api=new t(`/api/`),this.nameTouched=!1}connectedCallback(){super.connectedCallback(),this.load(),this.liveTimer=setInterval(()=>void this.refreshChanges(),5e3)}disconnectedCallback(){super.disconnectedCallback(),this.liveTimer&&clearInterval(this.liveTimer)}async load(){await this.refreshChanges();try{this.archived=(await this.api.archive()).archive??[]}catch{}try{this.models=await this.api.models()}catch{}}async refreshChanges(){try{let e=await this.api.changes();this.projects=o(e.projects),this.gh=e.ghUsage??null,this.usage=e.usage??null,this.version=e.version??``;let t=e.projectId||this.projects.find(t=>t.name===e.project)?.id||this.projects[0]?.id||``;this.defProjId=t,t&&(this.projId=t)}catch{}}onReq(e){this.req=e,this.nameTouched||(this.name=d(this.req.replace(/[@/]\S+/g,` `).split(/\s+/).slice(0,6).join(` `))),this.scheduleEstimate()}scheduleEstimate(){this.estTimer&&clearTimeout(this.estTimer),this.estTimer=setTimeout(()=>void this.fetchEstimate(),350)}async fetchEstimate(){if(!this.req.trim()){this.est=null,this.phaseSel=[],this.pipelineTouched=!1,this.runTests=!1;return}let e=++this.estSeq,t=this.pipelineTouched;try{let n=await this.api.estimate(this.req,t?this.effectivePipeline():void 0);if(e!==this.estSeq)return;this.est={total:n.total,rows:n.phases,saved:n.noRescanSaved,actions:n.actions??[],checks:n.checks??[],testCmd:n.testCmd??null},this.complexity=n.complexity||this.complexity,t||(this.phaseSel=n.phases.map(e=>e.phase),this.proposedPlan=n.phases.map(e=>e.phase)),n.testCmd||(this.runTests=!1)}catch{}}effectivePipeline(){let e=new Set([...this.phaseSel,...E]);return T.filter(t=>e.has(t))}togglePhase(e){if(E.includes(e))return;this.pipelineTouched=!0;let t=this.phaseSel.includes(e)?this.phaseSel.filter(t=>t!==e):[...this.phaseSel,e];this.phaseSel=T.filter(e=>t.includes(e)),this.scheduleEstimate()}resetPipeline(){this.pipelineTouched=!1,this.proposedPlan.length&&(this.phaseSel=[...this.proposedPlan]),this.scheduleEstimate()}pipelineForLaunch(){return this.pipelineTouched?this.effectivePipeline():void 0}onSearch(e){this.q=e.target.value,this.searchTimer&&clearTimeout(this.searchTimer),this.searchTimer=setTimeout(()=>void this.runSearch(),280)}async runSearch(){if(!this.q.trim()){this.hits=[];return}try{this.hits=(await this.api.search(this.q)).hits??[]}catch{}}addImageFiles(e){if(e)for(let t of Array.from(e)){if(!/^image\//.test(t.type))continue;if(this.atts.length>=4){this.error=`máximo 4 imágenes por run`;break}if(t.size>3*1048576){this.error=`«${t.name||`imagen`}» supera 3 MB — recórtala o comprímela`;continue}let e=new FileReader;e.onload=()=>{this.atts=[...this.atts,{name:t.name||`captura.png`,data:String(e.result||``)}]},e.readAsDataURL(t)}}onReqPaste(e){let t=e.clipboardData?.files;t&&t.length&&(e.preventDefault(),this.addImageFiles(t))}onReqDrop(e){e.preventDefault(),this.addImageFiles(e.dataTransfer?.files??null)}async launch(e){if(e.preventDefault(),!this.req.trim()||!this.name){this.error=`Indica la petición y el nombre del cambio`;return}this.busy=!0,this.error=``;let t={};this.mPlanner&&(t.planner=this.mPlanner),this.mCoder&&(t.coder=this.mCoder),this.mReviewer&&(t.reviewer=this.mReviewer);try{let e=await this.api.launch({request:this.req,name:d(this.name),complexity:this.complexity,auto:this.auto,projectId:this.projId||void 0,models:Object.keys(t).length?t:void 0,pipeline:this.pipelineForLaunch(),runTests:this.runTests,attachments:this.atts.length?this.atts:void 0});if(e.ok&&e.url){this.atts=[],p.go(e.url);return}if(e.needsInit){await this.refreshChanges(),this.error=``;return}this.error=e.error??`no se pudo lanzar`}catch(e){this.error=e.message}finally{this.busy=!1}}async doInit(){this.initBusy=!0,this.initMsg=``;try{let e=await this.api.init(this.projId||void 0);e.ok?await this.refreshChanges():this.initMsg=e.error??`no se pudo inicializar`}catch(e){this.initMsg=e.message}finally{this.initBusy=!1}}initPanel(t){return e`
      <div class="launch-init" style="display:flex;flex-wrap:wrap;align-items:center;gap:.8rem;padding:1rem 1.1rem;border:1px solid var(--bd);border-left:3px solid var(--accent);border-radius:var(--r);background:var(--accentbg);color:var(--tx)">
        <span style="font-size:.9rem"><b>${t.name}</b> aún no tiene gobierno SDD.</span>
        <button class="btn" ?disabled=${this.initBusy} @click=${()=>void this.doInit()}>${this.initBusy?`Inicializando…`:`Inicializar`}</button>
        <span class="muted" style="font-size:.76rem">crea <code>openspec/</code> · no toca tu código</span>
        ${this.initMsg?e`<p role="alert" style="margin:0;font-size:.82rem;color:var(--bad);flex-basis:100%">${this.initMsg}</p>`:a}
      </div>`}async resume(e,t){let n=await this.api.resumeNamed(t.name,e.id);n.ok&&n.url&&p.go(n.url)}reuse(e){this.nameTouched=!1,this.pipelineTouched=!1,this.phaseSel=[],this.proposedPlan=[],this.onReq(e.request);try{window.scrollTo({top:0,behavior:`smooth`})}catch{}}metrics(e){let t=e.flatMap(e=>e.changes??[]);return{total:t.length,green:t.filter(e=>l(e.verdict)===`GREEN`).length,curso:t.filter(e=>l(e.verdict)===`CURSO`).length,tin:t.reduce((e,t)=>e+(t.tokens?.in??0),0),tout:t.reduce((e,t)=>e+(t.tokens?.out??0),0)}}activeProject(){return this.projects.find(e=>e.id===this.projId)??null}scopeProjects(){let e=this.activeProject();return e?[e]:this.projects}attention(){return this.projects.flatMap(e=>(e.changes??[]).filter(e=>e.pending).map(t=>({p:e,c:t})))}modelOptions(){let e=this.models;return e?[...e.byokCreds?e.byok.map(e=>`byok:`+e):[],...e.copilot.map(e=>`copilot:`+e)]:[]}tierRank(e){return e===`premium`?3:e===`economy`?1:2}applyPreset(e){if(this.preset=e,e===`clear`){this.mPlanner=``,this.mCoder=``,this.mReviewer=``;return}let t=this.models;if(!t)return;let n=t.tiers??{},r=[...t.copilot],i=r.length?`copilot:`+[...r].sort((e,t)=>this.tierRank(n[e])-this.tierRank(n[t]))[0]:``,a=r.length?`copilot:`+[...r].sort((e,t)=>this.tierRank(n[t])-this.tierRank(n[e]))[0]:``,o=``,s=``,c=``;if(e===`quality`)o=s=c=a;else{let e=r.filter(e=>n[e]!==`premium`),a=e.length?e:r,l=a.length?`copilot:`+[...a].sort((e,t)=>this.tierRank(n[t])-this.tierRank(n[e]))[0]:``,u=t.byok.length?`byok:`+[...t.byok].sort((e,t)=>this.tierRank(n[e])-this.tierRank(n[t]))[0]:``;s=t.byokCreds&&t.byok.length>0?u:i,o=i,c=l||i}let l=this.modelOptions(),u=e=>e&&l.includes(e)?e:``;this.mPlanner=u(o),this.mCoder=u(s),this.mReviewer=u(c)}async saveModelsDefault(){let e={};this.mPlanner&&(e.planner=this.mPlanner),this.mCoder&&(e.coder=this.mCoder),this.mReviewer&&(e.reviewer=this.mReviewer),this.savingDefaults=!0,this.saveDefaultsMsg=``;try{let t=await this.api.modelsDefault(e,this.projId||void 0);this.saveDefaultsMsg=t.ok?`✓ guardado en openspec/conductor.json — commitéalo para tu equipo`:t.error??`no se pudo guardar`}catch(e){this.saveDefaultsMsg=e.message}finally{this.savingDefaults=!1,setTimeout(()=>{this.saveDefaultsMsg=``},6e3)}}byokHost(){let e=this.models?.byokUrl||``;try{return new URL(e).host}catch{return e||`LiteLLM`}}byokForm(){let t=this.models,n=t?.byokReason??null,r=!!t?.byokCreds&&!n,i=e`<p class="inst-note">Crea <code>~/.conductor/litellm.json</code> — formato OpenCode con lo que conductor necesita:</p>
      <pre class="inst-code">{
  "baseUrl": "https://…/v1",
  "apiKey": "sk-…",
  "models": {
    "deepseek-v4-flash": { "limit": { "context": 250000, "output": 16384 } },
    "glm-v52": { "limit": { "context": 250000, "output": 16384 } }
  }
}</pre>
      <p class="inst-note"><code>models</code> = tu catálogo declarado: sale SIEMPRE en el selector (sin depender del proxy) y sus límites
      viajan a cada fase. Al primer uso conductor <strong>sella</strong> el fichero: cifra la key (AES-256-GCM, Win/Mac/Linux) y la
      versión en claro desaparece del disco. <strong>Nunca sale de tu máquina</strong>, no se registra ni se cachea.</p>`;return r?e`
        <details class="inst-panel" style="margin-top:.6rem">
          <summary class="inst-head">
            <span class="inst-led on-ok" aria-hidden="true"></span>
            <span class="inst-title">LiteLLM</span>
            <span class="inst-status ok">Conectado</span>
            <span class="inst-chev" aria-hidden="true"></span>
          </summary>
          <div class="inst-body">
            <dl class="readout">
              <div class="ro-row"><dt>Proveedor</dt><dd>${this.byokHost()}</dd></div>
              <div class="ro-row"><dt>Credencial</dt><dd>~/.conductor/litellm.json · cifrada (AES-256-GCM)</dd></div>
              <div class="ro-row"><dt>Privacidad</dt><dd>Nunca sale de tu máquina · no se registra</dd></div>
            </dl>
            <p class="inst-note">¿Key caducada o rotada? Escribe la nueva en <code>~/.conductor/litellm.json</code>
              (campo <code>apiKey</code>; conductor la re-sella al primer uso) o ejecuta <code>conductor litellm login</code>.</p>
          </div>
        </details>`:t?.byokCreds&&n?e`
        <details class="inst-panel inst-prompt" style="margin-top:.6rem" open>
          <summary class="inst-head">
            <span class="inst-led on-warn" aria-hidden="true"></span>
            <span class="inst-title">LiteLLM</span>
            <span class="inst-status warn">Atención</span>
            <span class="inst-chev" aria-hidden="true"></span>
          </summary>
          <div class="inst-body">
            <div class="inst-msg bad" role="status" aria-live="polite">${n}</div>
            ${i}
          </div>
        </details>`:e`
      <details class="inst-panel inst-prompt" style="margin-top:.6rem">
        <summary class="inst-head">
          <span class="inst-led on-warn" aria-hidden="true"></span>
          <span class="inst-title">Conectar LiteLLM</span>
          <span class="inst-status warn">Configuración única</span>
          <span class="inst-chev" aria-hidden="true"></span>
        </summary>
        <div class="inst-body">
          <p class="inst-note">Conecta tu proxy LiteLLM <strong>una sola vez</strong> para usar tus modelos corporativos (más baratos, 0 AI Credits) en las fases que elijas.</p>
          ${i}
          ${n?e`<div class="inst-msg bad" role="status" aria-live="polite">${n}</div>`:a}
        </div>
      </details>`}planPanel(){let t=this.est?.checks??[],n=t.filter(e=>e.always),r=t.filter(e=>!e.always),i=new Set(this.phaseSel);return e`
      <div class="launch-plan" style="margin:.1rem 0 .2rem;padding:.7rem .9rem;border-left:3px solid var(--accent);background:var(--accentbg);border-radius:7px;color:var(--tx)">
        <div style="display:flex;align-items:baseline;justify-content:space-between;gap:.6rem">
          <span style="font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;color:var(--tx2);font-weight:600">Plan · fases SDD (OpenSpec)</span>
          ${this.pipelineTouched?e`<button type="button" @click=${()=>this.resetPipeline()} style="background:none;border:none;padding:0;font-size:.74rem;color:var(--accent,#4f7cff);cursor:pointer;text-decoration:underline">restablecer plan propuesto</button>`:a}
        </div>
        <p class="muted" style="margin:.2rem 0 .1rem;font-size:.74rem">Marca las fases que se ejecutarán. <strong style="font-weight:600">spec · apply · verify</strong> son obligatorias (gobierno).</p>
        <ul role="group" aria-label="Fases SDD del run" style="margin:.35rem 0 0;padding:0;list-style:none;font-size:.85rem;line-height:1.5">
          ${T.map(t=>{let n=w[t],r=E.includes(t),o=r||i.has(t);return e`<li style="padding:.12rem 0">
              <label style="display:flex;align-items:center;gap:.45rem;cursor:${r?`default`:`pointer`};${o?``:`opacity:.5`}">
                <input type="checkbox" .checked=${o} ?disabled=${r} @change=${()=>this.togglePhase(t)} aria-label="${t}${r?` (obligatoria, no se puede quitar)`:` (opcional)`}">
                <strong style="font-weight:600">${t}</strong>
                ${r?e`<span title="obligatoria — gobierno innegociable" aria-hidden="true">🔒</span>`:a}
                ${n?.artifact?e`<span class="muted" style="font-weight:400">→ ${n.artifact}</span>`:a}
                ${n?.gate?e`<span class="muted" style="font-weight:400">· ${n.gate}</span>`:a}
              </label>
            </li>`})}
        </ul>
        <div style="margin-top:.5rem;padding-top:.5rem;border-top:1px dashed var(--bd,#d8dee9)">
          <label style="display:flex;align-items:center;gap:.45rem;cursor:${this.est?.testCmd?`pointer`:`not-allowed`};${this.est?.testCmd?``:`opacity:.5`}" title=${this.est?.testCmd?`Ejecuta las pruebas REALES del proyecto ANTES de verify. Si fallan → ciclo fix → reintenta; si no pasan tras N intentos, el run queda BLOCKED.`:`No se detectó comando de pruebas en este proyecto`}>
            <input type="checkbox" .checked=${this.runTests} ?disabled=${!this.est?.testCmd} @change=${e=>{this.runTests=e.target.checked}} aria-label="ejecutar las pruebas del proyecto tras el gate (opcional)">
            <strong style="font-weight:600">test</strong>
            ${this.est?.testCmd?e`<span class="muted" style="font-weight:400">→ ejecutar pruebas del proyecto · <code style="font-size:.85em">${this.est.testCmd}</code></span>`:e`<span class="muted" style="font-weight:400">→ sin comando de pruebas detectado</span>`}
          </label>
          <p class="muted" style="margin:.1rem 0 0 1.55rem;font-size:.72rem">Opcional · corre ANTES de verify (apply → test → fix → verify). Si fallan, reintenta con fix; si no pasan, BLOCKED.</p>
        </div>
        ${n.length?e`
          <div style="margin-top:.5rem;font-size:.82rem"><span class="muted">Comprobaré:</span></div>
          <ul style="margin:.2rem 0 0;padding-left:1.15rem;font-size:.82rem;line-height:1.5">
            ${n.map(t=>e`<li>${t.label}</li>`)}
          </ul>`:a}
        ${r.length?e`
          <div style="margin-top:.45rem;font-size:.82rem"><span class="muted">Recomendado para este cambio</span> <span class="muted" style="font-size:.76rem">· actívalo en openspec/conductor.json</span></div>
          <ul style="margin:.2rem 0 0;padding-left:1.15rem;font-size:.82rem;line-height:1.5">
            ${r.map(t=>e`<li>${t.label}${t.why?e` <span class="muted">— ${t.why}</span>`:a}</li>`)}
          </ul>`:a}
      </div>`}render(){let t=this.scopeProjects(),n=this.metrics(t),r=this.modelOptions(),i=t.flatMap(e=>(e.changes??[]).filter(e=>l(e.verdict)===`CURSO`).map(t=>({p:e,c:t}))),o=t.flatMap(e=>(e.changes??[]).filter(e=>l(e.verdict)!==`CURSO`).map(t=>({p:e,c:t}))),s=e`
      <form class="launch-form" @submit=${e=>void this.launch(e)}>
        <label class="fl" @paste=${e=>this.onReqPaste(e)} @drop=${e=>this.onReqDrop(e)} @dragover=${e=>e.preventDefault()}>Qué quieres construir
          <mention-input .value=${this.req} .projId=${this.projId} placeholder="Describe el cambio en una frase o pega una spec. Escribe @ para dar contexto de un fichero · / para aplicar una skill del equipo · pega o arrastra capturas" @cdr-input=${e=>this.onReq(e.detail.value)}></mention-input>
        </label>
        ${this.atts.length?e`<div class="att-row">
          ${this.atts.map((t,n)=>e`<span class="att-chip"><img src=${t.data} alt="">${t.name}<button type="button" class="att-x" aria-label="Quitar ${t.name}" @click=${()=>{this.atts=this.atts.filter((e,t)=>t!==n)}}>×</button></span>`)}
          <span class="muted att-hint">van al change como <code>attachments/</code> — el agente las abre con view</span>
        </div>`:a}
        ${this.req.trim()&&this.est?this.planPanel():a}
        <div class="frow">
          <label class="fl" style="flex:1;min-width:10rem" title="Cómo se llamará esta tarea (auto-sugerido a partir de tu descripción; edítalo si quieres).">Nombre<input .value=${this.name} @input=${e=>{this.name=e.target.value,this.nameTouched=!0}} placeholder="p.ej. cupon-descuento" pattern="[a-z0-9-]+" required></label>
          <button class="btn" ?disabled=${this.busy} style="align-self:end">${this.busy?`…`:`Lanzar run`}</button>
        </div>
        <div class="launch-meta">
          ${this.launchModelSummary()}
          <!-- auto-aprobar FUERA del foco primario (doctrina "el experto manda"): opción secundaria y tenue,
               no un toggle junto al CTA. Por defecto OFF = con pausas de revisión. -->
          <label class="lm-auto ${this.auto?`on`:``}" title="Sin pausas de revisión: el pipeline corre de principio a fin. Por defecto OFF — el experto revisa."><input type="checkbox" aria-label="Auto-aprobar: ejecutar sin pausas de revisión" .checked=${this.auto} @change=${e=>{this.auto=e.target.checked}}>ejecutar sin pausas</label>
          ${this.est?e`<details class="lm-estd"><summary class="lm-est">≈ ${c(this.est.total)} tokens · ${this.est.rows.length} fases <span class="muted">· preflight, sin API</span></summary>
            <table class="est-tab">${this.est.rows.map(t=>e`<tr><td>${t.phase}</td><td>↓ ${c(t.estIn)}</td><td>↑ ${c(t.estOut)}</td></tr>`)}</table>
            ${this.est.saved>0?e`<p class="est-saved">Ahorro estimado de ${c(this.est.saved)} tokens de entrada <span class="muted">(el planner no relee el repositorio)</span></p>`:a}
          </details>`:a}
        </div>
        ${r.length?e`
        <details class="inst-panel" style="margin-top:.6rem">
          <summary class="inst-head">
            <span class="inst-led" aria-hidden="true"></span>
            <span class="inst-title">Modelo por fase</span>
            <span class="inst-sub">${this.preset===`cost`?`Optimizar coste`:this.preset===`quality`?`Máxima calidad`:`Recomendado`}</span>
            <span class="inst-chev" aria-hidden="true"></span>
          </summary>
          <div class="inst-body">
            <div class="seg-group" role="radiogroup" aria-label="Preajuste de modelo por fase">
              <button type="button" role="radio" aria-checked=${this.preset===`cost`} class="seg cost ${this.preset===`cost`?`on`:``}" @click=${()=>this.applyPreset(`cost`)} title="Coder → el modelo LiteLLM más barato · Reviewer → Copilot capaz · Planner → Copilot económico"><span class="seg-led" aria-hidden="true"></span>Optimizar coste</button>
              <button type="button" role="radio" aria-checked=${this.preset===`quality`} class="seg ${this.preset===`quality`?`on`:``}" @click=${()=>this.applyPreset(`quality`)} title="Todas las fases con el Copilot más capaz"><span class="seg-led" aria-hidden="true"></span>Máxima calidad</button>
              <button type="button" role="radio" aria-checked=${this.preset===`clear`||this.preset===``} class="seg ${this.preset===`clear`||this.preset===``?`on`:``}" @click=${()=>this.applyPreset(`clear`)} title="Cada fase usa el modelo recomendado por conductor"><span class="seg-led" aria-hidden="true"></span>Recomendado</button>
            </div>
            <div class="phase-grid">
              ${this.roleSelect(`Planner`,this.mPlanner,e=>{this.mPlanner=e,this.preset=``})}
              ${this.roleSelect(`Coder`,this.mCoder,e=>{this.mCoder=e,this.preset=``})}
              ${this.roleSelect(`Reviewer`,this.mReviewer,e=>{this.mReviewer=e,this.preset=``})}
            </div>
            ${this.mixNote()}
            <!-- B5: defaults en el REPO, la web los cambia — persiste la mezcla en openspec/conductor.json -->
            <div class="frow" style="margin-top:.55rem;align-items:center">
              <button type="button" class="btn sm sec" ?disabled=${this.savingDefaults||!(this.mPlanner||this.mCoder||this.mReviewer)} @click=${()=>void this.saveModelsDefault()} title="Escribe esta mezcla en openspec/conductor.json — será el default del EQUIPO para este proyecto (committeable)">${this.savingDefaults?`…`:`💾 Guardar como default del proyecto`}</button>
              ${this.saveDefaultsMsg?e`<span class="inst-msg ${this.saveDefaultsMsg.startsWith(`✓`)?`ok`:`bad`}" role="status" aria-live="polite" style="margin-top:0">${this.saveDefaultsMsg}</span>`:a}
            </div>
          </div>
        </details>`:a}
        ${this.byokForm()}
      </form>
      ${this.error?e`<p role="alert" style="color:var(--bad)">${this.error}</p>`:a}
    `,u=this.projects.find(e=>e.id===this.projId)??null,d=u&&u.openspec===!1?this.initPanel(u):s,f=this.attention();return e`
      <!-- la home ES tu proyecto: el título lleva su nombre (el texto que no orienta se ha podado; la ruta
           vive en el tooltip del selector y la versión del motor en el pliegue de Métricas) -->
      <div class="apphdr"><h1>${u?u.name:`conductor`}</h1></div>
      ${f.length?e`<div class="attn" role="alert" aria-label="runs que esperan tu decisión">
        ${f.map(({p:t,c:n})=>e`<a class="attn-item" href="/run/${t.id}/${n.name}">⏸ <b>${n.name}</b> espera tu decisión${this.projects.length>1?e` <span class="muted">· 📁 ${t.name}</span>`:a}<span class="attn-go">Abrir →</span></a>`)}
      </div>`:a}
      <!-- coste "1 cifra en su momento" (decisión de producto): el desglose vive plegado; la cifra oportuna
           va en el estimate del form (al decidir) y en el run (al terminar). AI Credits queda como única señal ambiente. -->
      <details class="launch-fold metrics">
        <summary>📊 Métricas${this.gh?e` <span class="muted" style="font-weight:500">· AI Credits ${this.gh.used}/${this.gh.entitlement}</span>`:a}${this.version?e` <span class="muted" style="font-weight:500;font-size:.74rem" title="versión del motor en uso">· v${this.version}</span>`:a}</summary>
        <div class="cards" style="margin-top:.9rem">
          <div class="card"><small>Runs</small><span>${n.total}</span></div>
          <div class="card ok"><small>Green</small><span>${n.green}</span></div>
          ${n.curso>0?e`<div class="card warn"><small>En curso</small><span>${n.curso}</span></div>`:a}
          <div class="card"><small>Tokens entrada ↓</small><span>${c(n.tin)}</span></div>
          <div class="card"><small>Tokens salida ↑</small><span>${c(n.tout)}</span></div>
          ${this.gh?e`<div class="card aic"><small>AI Credits</small><span>${this.gh.used}/${this.gh.entitlement}</span><div class="pbar ${this.gh.percentUsed>80?`warn`:``}"><i style="width:${Math.min(100,this.gh.percentUsed)}%"></i></div></div>`:a}
          ${this.usage?e`<div class="card"><small>Uso total LiteLLM</small><span>$${this.usage.spend.toFixed(2)}${this.usage.budget?e` <span class="muted" style="font-size:.8rem;font-weight:500">/ $${this.usage.budget.toFixed(0)}</span>`:a}</span>${this.usage.budget?e`<div class="pbar ${this.usage.spend/this.usage.budget>.8?`warn`:``}"><i style="width:${Math.min(100,this.usage.spend/this.usage.budget*100)}%"></i></div>`:a}</div>`:a}
        </div>
      </details>

      ${i.length>0?e`
        <h2 class="sect">En curso</h2>
        ${i.map(({p:e,c:t})=>this.runRow(e,t))}
        <details class="launch-fold" style="margin: 1.1rem 0 .3rem">
          <summary>Nueva funcionalidad</summary>
          ${d}
        </details>
      `:d}

      <!-- UN SOLO input de búsqueda en posición estable: al teclear, this.q cambia y el re-render antes
           DESMONTABA el input de "Historial" y MONTABA el de "Búsqueda" (nodos DOM distintos) → se perdía el
           foco tras la 1ª tecla. Ahora el input persiste; solo cambian el título y el contenido de abajo. -->
      ${o.length>0||this.q.trim()?e`
        <div class="sectrow">
          <h2 class="sect">${this.q.trim()?`Búsqueda`:`Historial`}</h2>
          <input class="search" type="search" placeholder="Buscar" .value=${this.q} @input=${e=>this.onSearch(e)} aria-label="buscar runs y cambios archivados">
        </div>
        ${this.q.trim()?e`<p class="muted" style="font-size:.78rem;margin:.2rem 0 .6rem">${this.hits.length} resultado${this.hits.length===1?``:`s`} para "${this.q}"</p>${this.hits.map(e=>this.hitRow(e))}`:o.map(({p:e,c:t})=>this.runRow(e,t))}
      `:a}

      ${n.total===0?e`<p class="muted" style="margin-top:.5rem">Aún no hay runs. Lanza el primero arriba.</p>`:a}

      ${this.archived.length?e`
        <details class="arch">
          <summary>📦 Archivados <span class="muted">· ${this.archived.length}</span></summary>
          ${this.archived.map(t=>e`
            <div class="arch-row">
              <status-pill .verdict=${t.verdict}></status-pill>
              <span class="nm">${t.name}</span>
              ${t.project?e`<span class="proj">📁 ${t.project}</span>`:a}
              <span class="muted">${t.date??``} · ${t.phases} fases · ${t.request}</span>
            </div>`)}
        </details>`:a}
    `}hitRow(t){let n=e`<status-pill .verdict=${t.verdict}></status-pill><span class="nm">${t.name}</span>${t.archived?e`<span class="tag">📦</span>`:a}${t.project?e`<span class="proj">📁 ${t.project}</span>`:a}<span class="muted snip">…${t.snippet}…</span>`;return e`<div class="hit-row">${t.archived?n:e`<a class="hit-main" href="/run/${t.projectId??this.defProjId}/${t.name}">${n}</a>`}</div>`}launchModelSummary(){let t=e=>e.replace(/^(byok|copilot):/,``),n=[this.mPlanner,this.mCoder,this.mReviewer];return n.some(Boolean)?e`<span class="lm-model" title="modelo elegido por fase — cámbialo en «Modelo por fase»">Modelo: <b>${n.every(e=>e===n[0])?t(n[0]):`planner ${t(this.mPlanner)||`—`} · coder ${t(this.mCoder)||`—`} · reviewer ${t(this.mReviewer)||`—`}`}</b></span>`:a}mixNote(){let t=[...new Set([this.mPlanner,this.mCoder,this.mReviewer].map(e=>e?e.startsWith(`byok:`)?`LiteLLM`:e.startsWith(`copilot:`)?`Copilot`:`sesión`:``).filter(Boolean))];return t.length<2?a:e`<div class="muted" style="font-size:.72rem;margin-top:.5rem">proveedores: ${t.join(` + `)}</div>`}roleSelect(t,n,r){let i=this.models,o=i?.copilot??[],s=i?.byok??[],c=!!i?.byokCreds,l=e=>e.startsWith(`claude`)?`Claude`:e.startsWith(`gpt`)?`GPT`:e.startsWith(`gemini`)?`Gemini`:`Otros`,u=[`Claude`,`GPT`,`Gemini`,`Otros`].map(e=>[e,o.filter(t=>l(t)===e).sort((e,t)=>t.localeCompare(e))]).filter(([,e])=>e.length),d=i?.copilotPending;return e`<label class="fl" style="flex:1">${t}<select .value=${n} title=${i?`Copilot: ${i.copilotSource} · LiteLLM: ${i.byokSource}`:``} @change=${e=>r(e.target.value)}>
      <option value="">Recomendado (conductor elige)</option>
      ${u.length?u.map(([t,n])=>e`<optgroup label="Copilot · ${t}${d?` · vistos en tus runs`:``}">${n.map(t=>e`<option value="copilot:${t}">${t}</option>`)}</optgroup>`):e`<option value="" disabled>catálogo Copilot aún no disponible</option>`}
      ${c&&s.length?e`<optgroup label="LiteLLM">${s.map(t=>e`<option value="byok:${t}">${i?.names?.[t]??t}</option>`)}</optgroup>`:a}
    </select></label>`}runRow(t,n){return e`
      <div class="run-row ${l(n.verdict)===`CURSO`?`run-active`:``}">
        <div class="run-l">
          <a class="main" href="/run/${t.id}/${n.name}">
            <span class="nm">${n.name} <status-pill .verdict=${n.pending?`EN PAUSA`:n.verdict}></status-pill>${n.pending?e`<span class="pill CURSO" title="el run espera tu revisión">⏸ tu decisión</span>`:a}</span>
            <span class="rq">${n.request}</span>
            <span class="proj">📁 ${t.name}</span>
          </a>
          <div class="run-foot">
            <span class="meta">${n.phases} fases${(n.tokens?.in??0)+(n.tokens?.out??0)>0?e` · ↓ ${c(n.tokens?.in)} entrada · ↑ ${c(n.tokens?.out)} salida`:a}</span>
            ${n.resumable?e`<button class="btn sm resume" @click=${()=>void this.resume(t,n)} aria-label="reanudar ${n.name}">⏯ Reanudar</button>`:a}
            ${!n.resumable&&l(n.verdict)!==`CURSO`&&n.request?e`<button class="btn sm sec" @click=${()=>this.reuse(n)} title="rellena el formulario con esta petición para lanzar una variante">↺ Reutilizar</button>`:a}
            ${n.hasDashboard?e`<a class="btn sm dash" href="/artifact/${t.id}/${n.name}/dashboard.html" target="_blank" aria-label="informe de ${n.name}">📊 Informe</a>`:a}
            ${n.phases>0?e`<a class="btn sm aiact" href="/api/run/${t.id}/${n.name}/aiact" target="_blank" aria-label="AI Act de ${n.name}">🛡 AI Act</a>`:a}
          </div>
        </div>
        <a class="run-open" href="/run/${t.id}/${n.name}" tabindex="-1" aria-hidden="true"><span class="chev" aria-hidden="true"></span></a>
      </div>`}};f([r()],D.prototype,`projects`,void 0),f([r()],D.prototype,`gh`,void 0),f([r()],D.prototype,`usage`,void 0),f([r()],D.prototype,`version`,void 0),f([r()],D.prototype,`models`,void 0),f([r()],D.prototype,`req`,void 0),f([r()],D.prototype,`name`,void 0),f([r()],D.prototype,`complexity`,void 0),f([r()],D.prototype,`auto`,void 0),f([r()],D.prototype,`projId`,void 0),f([r()],D.prototype,`mPlanner`,void 0),f([r()],D.prototype,`mCoder`,void 0),f([r()],D.prototype,`mReviewer`,void 0),f([r()],D.prototype,`preset`,void 0),f([r()],D.prototype,`busy`,void 0),f([r()],D.prototype,`error`,void 0),f([r()],D.prototype,`atts`,void 0),f([r()],D.prototype,`savingDefaults`,void 0),f([r()],D.prototype,`saveDefaultsMsg`,void 0),f([r()],D.prototype,`est`,void 0),f([r()],D.prototype,`phaseSel`,void 0),f([r()],D.prototype,`runTests`,void 0),f([r()],D.prototype,`initBusy`,void 0),f([r()],D.prototype,`q`,void 0),f([r()],D.prototype,`hits`,void 0),f([r()],D.prototype,`archived`,void 0),D=f([s(`panel-screen`)],D);export{D as PanelScreen};
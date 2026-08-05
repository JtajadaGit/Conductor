import{_ as e,c as t,d as n,f as r,g as i,h as a,i as o,l as s,m as c,n as l,o as u,p as d,r as f,t as p,u as m,v as h,y as g}from"./index-DYWWmM6P.js";import"./status-pill-Bmev9ekc.js";var _={ATTRIBUTE:1,CHILD:2,PROPERTY:3,BOOLEAN_ATTRIBUTE:4,EVENT:5,ELEMENT:6},v=e=>(...t)=>({_$litDirective$:e,values:t}),y=class{constructor(e){}get _$AU(){return this._$AM._$AU}_$AT(e,t,n){this._$Ct=e,this._$AM=t,this._$Ci=n}_$AS(e,t){return this.update(e,t)}update(e,t){return this.render(...t)}},{I:b}=g,x=e=>e.strings===void 0,S={},C=(e,t=S)=>e._$AH=t,w=v(class extends y{constructor(e){if(super(e),e.type!==_.PROPERTY&&e.type!==_.ATTRIBUTE&&e.type!==_.BOOLEAN_ATTRIBUTE)throw Error("The `live` directive is not allowed on child or event bindings");if(!x(e))throw Error("`live` bindings can only contain a single expression")}render(e){return e}update(t,[n]){if(n===e||n===i)return n;let r=t.element,a=t.name;if(t.type===_.PROPERTY){if(n===r[a])return e}else if(t.type===_.BOOLEAN_ATTRIBUTE){if(!!n===r.hasAttribute(a))return e}else if(t.type===_.ATTRIBUTE&&r.getAttribute(a)===n+``)return e;return C(t),n}}),T=class extends r{constructor(...e){super(...e),this.value=``,this.projId=``,this.placeholder=``,this.rows=3,this.open=!1,this.items=[],this.index=0,this.kind=`@`,this.query=``,this.tokStart=0,this.timer=0,this.seq=0,this.pendingCaret=null,this.skillsCache=null,this.skillsCacheProj=``}disconnectedCallback(){super.disconnectedCallback(),clearTimeout(this.timer)}emit(e){this.dispatchEvent(new CustomEvent(`cdr-input`,{detail:{value:e},bubbles:!0,composed:!0}))}close(){this.open=!1,this.items=[],clearTimeout(this.timer)}onInput(e){let t=e.target;this.emit(t.value);let n=t.value.slice(0,t.selectionStart).match(/(^|\s)(?:@([^\s@]*)|\/([^\s@/]*))$/);if(!n){this.close();return}let r=n[2]!==void 0;this.kind=r?`@`:`/`,this.query=r?n[2]:n[3],this.tokStart=t.selectionStart-this.query.length-1,this.open=!0,this.index=0,clearTimeout(this.timer),this.timer=window.setTimeout(()=>void this.fetchItems(),130)}async fetchItems(){let e=++this.seq,t=this.projId;try{let n=new URLSearchParams;if(t&&n.set(`project`,t),this.kind===`@`){n.set(`q`,this.query);let t=await(await fetch(`/api/files?`+n)).json();if(e!==this.seq)return;this.items=(t.files||[]).slice(0,30).map(e=>({v:e,label:e}))}else{if((!this.skillsCache||this.skillsCacheProj!==t)&&(this.skillsCache=(await(await fetch(`/api/skills?`+n)).json()).skills||[],this.skillsCacheProj=t),e!==this.seq)return;let r=this.query.toLowerCase();this.items=(this.skillsCache||[]).filter(e=>!r||e.name.toLowerCase().includes(r)).slice(0,20).map(e=>({v:e.name,label:e.name,sub:e.title}))}this.index=0}catch{this.items=[]}}onKey(e){this.open&&(e.key===`ArrowDown`?(e.preventDefault(),this.items.length&&(this.index=(this.index+1)%this.items.length)):e.key===`ArrowUp`?(e.preventDefault(),this.items.length&&(this.index=(this.index-1+this.items.length)%this.items.length)):(e.key===`Enter`||e.key===`Tab`)&&this.items.length?(e.preventDefault(),this.insert(this.items[this.index])):e.key===`Escape`&&(e.preventDefault(),this.close()))}insert(e){let t=this.querySelector(`textarea`);if(!t)return;let n=t.selectionStart,r=this.kind===`@`&&/\s/.test(e.v)?`"`+e.v+`"`:e.v,i=this.kind+r,a=t.value.slice(0,this.tokStart)+i+` `+t.value.slice(n),o=this.tokStart+i.length+1;this.value=a,this.pendingCaret=o,this.emit(a),this.close()}updated(){if(this.pendingCaret==null)return;let e=this.querySelector(`textarea`);e&&(e.focus(),e.setSelectionRange(this.pendingCaret,this.pendingCaret)),this.pendingCaret=null}render(){return h`
      <div class="mi-wrap">
        <textarea class="mi-ta" rows=${this.rows} placeholder=${this.placeholder} .value=${w(this.value)} required
          role="combobox" aria-autocomplete="list" aria-expanded=${this.open?`true`:`false`}
          aria-controls="mi-menu" aria-activedescendant=${this.open&&this.items.length?`mi-opt-`+this.index:i}
          @input=${e=>this.onInput(e)} @keydown=${e=>this.onKey(e)}
          @blur=${()=>{this.timer=window.setTimeout(()=>{this.open=!1},130)}}></textarea>
        ${this.open?h`
          <ul id="mi-menu" class="mi-menu" role="listbox" aria-label=${this.kind===`@`?`ficheros`:`skills`}>
            <li class="mi-head">${this.kind===`@`?`FICHERO PARA CONTEXTO`:`SKILL DEL EQUIPO`}</li>
            ${this.items.length?this.items.map((e,t)=>h`
              <li id=${`mi-opt-`+t} role="option" aria-selected=${t===this.index?`true`:`false`} class="mi-item ${t===this.index?`on`:``}"
                @mousemove=${()=>{this.index=t}} @mousedown=${t=>{t.preventDefault(),this.insert(e)}}>
                <span class="mi-trig">${this.kind}</span><span class="mi-lbl">${e.label}</span>${e.sub?h`<span class="mi-sub">${e.sub}</span>`:i}
              </li>`):h`<li class="mi-empty">Sin resultados para "${this.query}"</li>`}
          </ul>`:i}
      </div>`}};m([c()],T.prototype,`value`,void 0),m([c()],T.prototype,`projId`,void 0),m([c()],T.prototype,`placeholder`,void 0),m([c({type:Number})],T.prototype,`rows`,void 0),m([d()],T.prototype,`open`,void 0),m([d()],T.prototype,`items`,void 0),m([d()],T.prototype,`index`,void 0),T=m([a(`mention-input`)],T);var E,D=new Set(`quiero quieres queria necesito necesitamos crea crear creame hazme haz hacer anade anadir agrega agregar implementa implementar genera generar pon poner un una unos unas el la los las de del en con sin para por favor que y o u a al es sea me mi tu su se lo nuevo nueva componente pagina want need create make add build new please i an the of with without for and or to my this esta este`.split(` `)),O=e=>e.normalize(`NFD`).replace(/[̀-ͯ]/g,``);function k(e){let t=O(e.replace(/[@/]\S+/g,` `)).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean),n=new Set,r=[];for(let e of t)if(!(D.has(e)||e.length<3||n.has(e))&&(n.add(e),r.push(e),r.length===5))break;return r.length?r.join(`-`):f(t.slice(0,6).join(` `))}var A={explore:{artifact:`exploration.md`},propose:{artifact:`proposal.md`},clarify:{artifact:`questions.md`},spec:{artifact:`spec.md`,gate:`estructura + escenarios`},design:{artifact:`design.md`},tasks:{artifact:`tasks.md`},apply:{artifact:`código + tests`,gate:`secretos · trazabilidad`},verify:{artifact:`verify-report.md`,gate:`gate determinista (innegociable)`},fix:{artifact:`apply-report.md`}},j=[`explore`,`propose`,`clarify`,`spec`,`design`,`tasks`,`apply`,`verify`],M=[`spec`,`apply`,`verify`],N=class extends r{static{E=this}constructor(...e){super(...e),this.projects=[],this.gh=null,this.usage=null,this.models=null,this.req=``,this.name=``,this.complexity=`medium`,this.auto=!1,this.routeProj=``,this.routeErr=``,this.loadedOnce=!1,this.projId=``,this.mPlanner=``,this.mCoder=``,this.mReviewer=``,this.mPhases={},this.preset=``,this.busy=!1,this.error=``,this.atts=[],this.savingDefaults=!1,this.saveDefaultsMsg=``,this.est=null,this.phaseSel=[],this.runTests=!1,this.initBusy=!1,this.initMsg=``,this.pipelineTouched=!1,this.estSeq=0,this.proposedPlan=[],this.q=``,this.hits=[],this.archived=[],this.defProjId=``,this.estTimer=null,this.searchTimer=null,this.liveTimer=null,this.api=new t(`/api/`),this.nameTouched=!1}connectedCallback(){super.connectedCallback(),this.load(),this.liveTimer=setInterval(()=>void this.refreshChanges(),5e3)}disconnectedCallback(){super.disconnectedCallback(),this.liveTimer&&clearInterval(this.liveTimer)}resolveRoute(){if(this.routeErr=``,this.routeProj){let e=this.projects.find(e=>e.id===this.routeProj),t=this.projects.filter(e=>e.name===this.routeProj),n=e??(t.length===1?t[0]:null);if(n){this.projId=n.id;return}this.projects.length&&(this.routeErr=t.length>1?`Hay ${t.length} proyectos llamados «${this.routeProj}» — usa la URL con id, p.ej. /${t[0].id}`:`No conozco el proyecto «${this.routeProj}» — te dejo en el panel global. Regístralo con \`conductor init\` en su repo.`)}this.projId=``}willUpdate(e){e.has(`routeProj`)&&this.resolveRoute()}updated(e){e.has(`routeProj`)&&this.refreshChanges()}async load(){await this.refreshChanges();try{this.archived=(await this.api.archive()).archive??[]}catch{}try{this.models=await this.api.models()}catch{}}async refreshChanges(){try{let e=await this.api.changes();this.projects=o(e.projects),this.gh=e.ghUsage??null,this.usage=e.usage??null;let t=e.projectId||this.projects.find(t=>t.name===e.project)?.id||this.projects[0]?.id||``;this.defProjId=t,this.loadedOnce=!0,this.resolveRoute()}catch{}}onReq(e){this.req=e,this.nameTouched||(this.name=k(this.req)),this.scheduleEstimate()}scheduleEstimate(){this.estTimer&&clearTimeout(this.estTimer),this.estTimer=setTimeout(()=>void this.fetchEstimate(),350)}async fetchEstimate(){if(!this.req.trim()){this.est=null,this.phaseSel=[],this.pipelineTouched=!1,this.runTests=!1;return}let e=++this.estSeq,t=this.pipelineTouched;try{let n=await this.api.estimate(this.req,t?this.effectivePipeline():void 0);if(e!==this.estSeq)return;this.est={total:n.total,rows:n.phases,saved:n.noRescanSaved,actions:n.actions??[],checks:n.checks??[],testCmd:n.testCmd??null},this.complexity=n.complexity||this.complexity,t||(this.phaseSel=n.phases.map(e=>e.phase),this.proposedPlan=n.phases.map(e=>e.phase)),n.testCmd||(this.runTests=!1)}catch{}}effectivePipeline(){let e=new Set([...this.phaseSel,...M]);return j.filter(t=>e.has(t))}togglePhase(e){if(M.includes(e))return;this.pipelineTouched=!0;let t=this.phaseSel.includes(e)?this.phaseSel.filter(t=>t!==e):[...this.phaseSel,e];this.phaseSel=j.filter(e=>t.includes(e)),this.scheduleEstimate()}resetPipeline(){this.pipelineTouched=!1,this.proposedPlan.length&&(this.phaseSel=[...this.proposedPlan]),this.scheduleEstimate()}pipelineForLaunch(){return this.pipelineTouched?this.effectivePipeline():void 0}onSearch(e){this.q=e.target.value,this.searchTimer&&clearTimeout(this.searchTimer),this.searchTimer=setTimeout(()=>void this.runSearch(),280)}async runSearch(){if(!this.q.trim()){this.hits=[];return}try{this.hits=(await this.api.search(this.q)).hits??[]}catch{}}addImageFiles(e){if(e)for(let t of Array.from(e)){if(!/^image\//.test(t.type))continue;if(this.atts.length>=4){this.error=`máximo 4 imágenes por run`;break}if(t.size>3*1048576){this.error=`«${t.name||`imagen`}» supera 3 MB — recórtala o comprímela`;continue}let e=new FileReader;e.onload=()=>{this.atts=[...this.atts,{name:t.name||`captura.png`,data:String(e.result||``)}]},e.readAsDataURL(t)}}onReqPaste(e){let t=e.clipboardData?.files;t&&t.length&&(e.preventDefault(),this.addImageFiles(t))}onReqDrop(e){e.preventDefault(),this.addImageFiles(e.dataTransfer?.files??null)}async launch(e){if(e.preventDefault(),!this.req.trim()||!this.name){this.error=`Indica la petición y el nombre del cambio`;return}this.busy=!0,this.error=``;let t={};this.mPlanner&&(t.planner=this.mPlanner),this.mCoder&&(t.coder=this.mCoder),this.mReviewer&&(t.reviewer=this.mReviewer);for(let[e,n]of Object.entries(this.mPhases))n&&(t[e]=n);try{let e=await this.api.launch({request:this.req,name:f(this.name),complexity:this.complexity,auto:this.auto,projectId:this.projId||void 0,models:Object.keys(t).length?t:void 0,pipeline:this.pipelineForLaunch(),runTests:this.runTests,attachments:this.atts.length?this.atts:void 0});if(e.ok&&e.url){this.atts=[],n.go(e.url);return}if(e.needsInit){await this.refreshChanges(),this.error=``;return}this.error=e.error??`no se pudo lanzar`}catch(e){this.error=e.message}finally{this.busy=!1}}async doInit(){this.initBusy=!0,this.initMsg=``;try{let e=await this.api.init(this.projId||void 0);e.ok?await this.refreshChanges():this.initMsg=e.error??`no se pudo inicializar`}catch(e){this.initMsg=e.message}finally{this.initBusy=!1}}initPanel(e){return h`
      <div class="launch-init" style="display:flex;flex-wrap:wrap;align-items:center;gap:.8rem;padding:1rem 1.1rem;border:1px solid var(--bd);border-left:3px solid var(--accent);border-radius:var(--r);background:var(--accentbg);color:var(--tx)">
        <span style="font-size:.9rem"><b>${e.name}</b> aún no tiene gobierno SDD.</span>
        <button class="btn" ?disabled=${this.initBusy} @click=${()=>void this.doInit()}>${this.initBusy?`Inicializando…`:`Inicializar`}</button>
        <span class="muted" style="font-size:.76rem">crea <code>openspec/</code> · no toca tu código</span>
        ${this.initMsg?h`<p role="alert" style="margin:0;font-size:.82rem;color:var(--bad);flex-basis:100%">${this.initMsg}</p>`:i}
      </div>`}async resume(e,t){let r=await this.api.resumeNamed(t.name,e.id);r.ok&&r.url&&n.go(r.url)}reuse(e){this.nameTouched=!1,this.pipelineTouched=!1,this.phaseSel=[],this.proposedPlan=[],this.onReq(e.request);try{window.scrollTo({top:0,behavior:`smooth`})}catch{}}metrics(e){let t=e.flatMap(e=>e.changes??[]);return{total:t.length,green:t.filter(e=>u(e.verdict)===`GREEN`).length,curso:t.filter(e=>u(e.verdict)===`CURSO`).length,tin:t.reduce((e,t)=>e+(t.tokens?.in??0),0),tout:t.reduce((e,t)=>e+(t.tokens?.out??0),0),measured:t.some(e=>!!e.tokens)}}activeProject(){return this.projects.find(e=>e.id===this.projId)??null}scopeProjects(){let e=this.activeProject();return e?[e]:this.projects}attention(){return this.projects.flatMap(e=>(e.changes??[]).filter(e=>e.pending).map(t=>({p:e,c:t})))}modelOptions(){let e=this.models;return e?[...e.byokCreds?e.byok.map(e=>`byok:`+e):[],...e.copilot.map(e=>`copilot:`+e)]:[]}tierRank(e){return e===`premium`?3:e===`economy`?1:2}static{this.PHASES=[`explore`,`propose`,`spec`,`design`,`tasks`,`apply`,`verify`]}modelLabel(e,t){let n=this.models,r=n?.names?.[e]??e,i=n?.meta?.[e]?.maxIn??0,a=[i>=1e6?`${+(i/1e6).toFixed(1).replace(/\.0$/,``)}M ctx`:i>0?`${Math.round(i/1e3)}k ctx`:``,t===`byok`?`0 créditos`:{low:`créditos bajos`,medium:`créditos medios`,high:`créditos altos`}[n?.credits?.[e]??``]??``].filter(Boolean).join(` · `);return a?`${r} — ${a}`:r}applyPreset(e){if(this.preset=e,e===`clear`){this.mPlanner=``,this.mCoder=``,this.mReviewer=``,this.mPhases={};return}let t=this.models;if(!t)return;let n=t.tiers??{},r=[...t.copilot],i=r.length?`copilot:`+[...r].sort((e,t)=>this.tierRank(n[e])-this.tierRank(n[t]))[0]:``,a=r.length?`copilot:`+[...r].sort((e,t)=>this.tierRank(n[t])-this.tierRank(n[e]))[0]:``,o=``,s=``,c=``;if(e===`quality`)o=s=c=a;else{let e=r.filter(e=>n[e]!==`premium`),a=e.length?e:r,l=a.length?`copilot:`+[...a].sort((e,t)=>this.tierRank(n[t])-this.tierRank(n[e]))[0]:``,u=t.byok.length?`byok:`+[...t.byok].sort((e,t)=>this.tierRank(n[e])-this.tierRank(n[t]))[0]:``;s=t.byokCreds&&t.byok.length>0?u:i,o=i,c=l||i}let l=this.modelOptions(),u=e=>e&&l.includes(e)?e:``;this.mPlanner=u(o),this.mCoder=u(s),this.mReviewer=u(c)}async saveModelsDefault(){let e={};this.mPlanner&&(e.planner=this.mPlanner),this.mCoder&&(e.coder=this.mCoder),this.mReviewer&&(e.reviewer=this.mReviewer);for(let[t,n]of Object.entries(this.mPhases))n&&(e[t]=n);this.savingDefaults=!0,this.saveDefaultsMsg=``;try{let t=await this.api.modelsDefault(e,this.projId||void 0);this.saveDefaultsMsg=t.ok?`✓ guardado en openspec/conductor.json — commitéalo para tu equipo`:t.error??`no se pudo guardar`}catch(e){this.saveDefaultsMsg=e.message}finally{this.savingDefaults=!1,setTimeout(()=>{this.saveDefaultsMsg=``},6e3)}}byokHost(){let e=this.models?.byokUrl||``;try{return new URL(e).host}catch{return e||`LiteLLM`}}byokForm(){let e=this.models,t=e?.byokReason??null,n=String(e?.byokSource??``).includes(`en vivo`),r=!!e?.byokCreds&&!t&&n,a=!!e?.byokCreds&&!t&&!n,o=h`<p class="inst-note">Abre <code>~/.conductor/litellm.json</code> (<code>conductor setup</code> deja la plantilla creada) y rellena tus datos — este es el formato:</p>
      <pre class="inst-code">{
  "baseUrl": "https://…/v1",
  "apiKey": "sk-…",
  "models": {
    "deepseek-v4-flash": { "limit": { "context": 250000, "output": 16384 } },
    "glm-v52": { "limit": { "context": 250000, "output": 16384 } }
  }
}</pre>
      <p class="inst-note"><code>models</code> = tu catálogo declarado: sale SIEMPRE en el selector (sin depender del proxy) y sus límites
      viajan a cada fase. La key se queda <strong>como tú la escribas</strong>; si prefieres
      cifrarla: <code>"seal": true</code> o <code>conductor litellm login</code>. <strong>Nunca sale de tu máquina</strong>, no se registra ni se cachea.</p>`,s=(e?.byok??[]).length?h`<p class="inst-note">Leído de <code>~/.conductor/litellm.json</code> — tu catálogo declarado (${e.byok.length}):
      <strong>${e.byok.map(t=>e?.names?.[t]??t).join(` · `)}</strong>. Sale en el selector aunque el proxy no conteste; sus límites viajan a cada fase.
      Comprueba QUÉ key hay dentro con <code>conductor litellm status</code> (huella, sin imprimirla).</p>`:i;return r?h`
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
              <div class="ro-row"><dt>Credencial</dt><dd>~/.conductor/litellm.json</dd></div>
              <div class="ro-row"><dt>Privacidad</dt><dd>Nunca sale de tu máquina · no se registra</dd></div>
            </dl>
            <p class="inst-note">¿Key caducada o rotada? Escribe la nueva en <code>~/.conductor/litellm.json</code>
              (campo <code>apiKey</code> — se queda tal cual) o ejecuta <code>conductor litellm login</code>. Verifica cuál hay dentro: <code>conductor litellm status</code>.</p>
          </div>
        </details>`:a?h`
        <details class="inst-panel" style="margin-top:.6rem">
          <summary class="inst-head">
            <span class="inst-led" aria-hidden="true"></span>
            <span class="inst-title">LiteLLM</span>
            <span class="inst-status idle">Configurado</span>
            <span class="inst-chev" aria-hidden="true"></span>
          </summary>
          <div class="inst-body">
            <dl class="readout">
              <div class="ro-row"><dt>Proveedor</dt><dd>${this.byokHost()}</dd></div>
              <!-- decia "cifrada" incondicional y el sellado es OPT-IN — mentia sobre seguridad -->
              <div class="ro-row"><dt>Credencial</dt><dd>~/.conductor/litellm.json · tal cual la escribiste</dd></div>
              <div class="ro-row"><dt>Catálogo</dt><dd>sin verificar aún en esta sesión — se comprueba al abrir el selector de modelos o lanzar un run</dd></div>
            </dl>
            <p class="inst-note">Si el proxy rechaza la key, aquí saldrá el motivo y cómo arreglarlo.</p>
          </div>
        </details>`:e?.byokCreds&&t?h`
        <details class="inst-panel inst-prompt" style="margin-top:.6rem" open>
          <summary class="inst-head">
            <span class="inst-led on-warn" aria-hidden="true"></span>
            <span class="inst-title">LiteLLM</span>
            <span class="inst-status warn">Atención</span>
            <span class="inst-chev" aria-hidden="true"></span>
          </summary>
          <div class="inst-body">
            <div class="inst-msg bad" role="status" aria-live="polite">${t}</div>
            ${(e?.byok??[]).length?s:o}
          </div>
        </details>`:h`
      <details class="inst-panel inst-prompt" style="margin-top:.6rem">
        <summary class="inst-head">
          <span class="inst-led on-warn" aria-hidden="true"></span>
          <span class="inst-title">Conectar LiteLLM</span>
          <span class="inst-status warn">Configuración única</span>
          <span class="inst-chev" aria-hidden="true"></span>
        </summary>
        <div class="inst-body">
          <p class="inst-note">Conecta tu proxy LiteLLM <strong>una sola vez</strong> para usar tus modelos corporativos (más baratos, 0 AI Credits) en las fases que elijas.</p>
          ${o}
          ${t?h`<div class="inst-msg bad" role="status" aria-live="polite">${t}</div>`:i}
        </div>
      </details>`}planPanel(){let e=this.est?.checks??[],t=e.filter(e=>e.always),n=e.filter(e=>!e.always),r=new Set(this.phaseSel);return h`
      <div class="launch-plan" style="margin:.1rem 0 .2rem;padding:.7rem .9rem;border-left:3px solid var(--accent);background:var(--accentbg);border-radius:7px;color:var(--tx)">
        <div style="display:flex;align-items:baseline;justify-content:space-between;gap:.6rem">
          <span style="font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;color:var(--tx2);font-weight:600">Plan · fases SDD (OpenSpec)</span>
          ${this.pipelineTouched?h`<button type="button" @click=${()=>this.resetPipeline()} style="background:none;border:none;padding:0;font-size:.74rem;color:var(--accent,#4f7cff);cursor:pointer;text-decoration:underline">restablecer plan propuesto</button>`:i}
        </div>
        <p class="muted" style="margin:.2rem 0 .1rem;font-size:.74rem">Marca las fases que se ejecutarán. <strong style="font-weight:600">spec · apply · verify</strong> son obligatorias (gobierno).</p>
        <ul role="group" aria-label="Fases SDD del run" style="margin:.35rem 0 0;padding:0;list-style:none;font-size:.85rem;line-height:1.5">
          ${j.map(e=>{let t=A[e],n=M.includes(e),a=n||r.has(e);return h`<li style="padding:.12rem 0">
              <label style="display:flex;align-items:center;gap:.45rem;cursor:${n?`default`:`pointer`};${a?``:`opacity:.5`}">
                <input type="checkbox" .checked=${a} ?disabled=${n} @change=${()=>this.togglePhase(e)} aria-label="${e}${n?` (obligatoria, no se puede quitar)`:` (opcional)`}">
                <strong style="font-weight:600">${e}</strong>
                ${n?h`<span title="obligatoria — gobierno innegociable" aria-hidden="true">${p(`lock`)}</span>`:i}
                ${t?.artifact?h`<span class="muted" style="font-weight:400">→ ${t.artifact}</span>`:i}
                ${t?.gate?h`<span class="muted" style="font-weight:400">· ${t.gate}</span>`:i}
              </label>
            </li>`})}
        </ul>
        <div style="margin-top:.5rem;padding-top:.5rem;border-top:1px dashed var(--bd,#d8dee9)">
          <label style="display:flex;align-items:center;gap:.45rem;cursor:${this.est?.testCmd?`pointer`:`not-allowed`};${this.est?.testCmd?``:`opacity:.5`}" title=${this.est?.testCmd?`Ejecuta las pruebas REALES del proyecto ANTES de verify. Si fallan → ciclo fix → reintenta; si no pasan tras N intentos, el run queda BLOCKED.`:`No se detectó comando de pruebas en este proyecto`}>
            <input type="checkbox" .checked=${this.runTests} ?disabled=${!this.est?.testCmd} @change=${e=>{this.runTests=e.target.checked}} aria-label="ejecutar las pruebas del proyecto tras el gate (opcional)">
            <strong style="font-weight:600">test</strong>
            ${this.est?.testCmd?h`<span class="muted" style="font-weight:400">→ ejecutar pruebas del proyecto · <code style="font-size:.85em">${this.est.testCmd}</code></span>`:h`<span class="muted" style="font-weight:400">→ sin comando de pruebas detectado</span>`}
          </label>
          <p class="muted" style="margin:.1rem 0 0 1.55rem;font-size:.72rem">Opcional · corre ANTES de verify (apply → test → fix → verify). Si fallan, reintenta con fix; si no pasan, BLOCKED.</p>
        </div>
        ${t.length?h`
          <div style="margin-top:.5rem;font-size:.82rem"><span class="muted">Comprobaré:</span></div>
          <ul style="margin:.2rem 0 0;padding-left:1.15rem;font-size:.82rem;line-height:1.5">
            ${t.map(e=>h`<li>${e.label}</li>`)}
          </ul>`:i}
        ${n.length?h`
          <div style="margin-top:.45rem;font-size:.82rem"><span class="muted">Recomendado para este cambio</span> <span class="muted" style="font-size:.76rem">· actívalo en openspec/conductor.json</span></div>
          <ul style="margin:.2rem 0 0;padding-left:1.15rem;font-size:.82rem;line-height:1.5">
            ${n.map(e=>h`<li>${e.label}${e.why?h` <span class="muted">— ${e.why}</span>`:i}</li>`)}
          </ul>`:i}
      </div>`}render(){if(!this.loadedOnce)return s(this.routeProj?`Cargando proyecto`:`Cargando panel`,!0);let e=this.scopeProjects(),t=this.metrics(e),n=this.modelOptions(),r=e.flatMap(e=>(e.changes??[]).filter(e=>u(e.verdict)===`CURSO`).map(t=>({p:e,c:t}))),a=e.flatMap(e=>(e.changes??[]).filter(e=>u(e.verdict)!==`CURSO`).map(t=>({p:e,c:t}))),o=h`
      <form class="launch-form" @submit=${e=>void this.launch(e)}>
        <label class="fl" @paste=${e=>this.onReqPaste(e)} @drop=${e=>this.onReqDrop(e)} @dragover=${e=>e.preventDefault()}>Prompt
          <mention-input .value=${this.req} .projId=${this.projId} placeholder="Describe el cambio en una frase o pega una spec. Escribe @ para dar contexto de un fichero · / para aplicar una skill del equipo · pega o arrastra capturas" @cdr-input=${e=>this.onReq(e.detail.value)}></mention-input>
        </label>
        ${this.atts.length?h`<div class="att-row">
          ${this.atts.map((e,t)=>h`<span class="att-chip"><img src=${e.data} alt="">${e.name}<button type="button" class="att-x" aria-label="Quitar ${e.name}" @click=${()=>{this.atts=this.atts.filter((e,n)=>n!==t)}}>×</button></span>`)}
          <span class="muted att-hint">van al change como <code>attachments/</code> — el agente las abre con view</span>
        </div>`:i}
        ${this.req.trim()&&this.est?this.planPanel():i}
        <div class="frow">
          <label class="fl" style="flex:1;min-width:10rem" title="Cómo se llamará esta tarea (auto-sugerido a partir de tu descripción; edítalo si quieres).">Nombre<input .value=${this.name} @input=${e=>{this.name=e.target.value,this.nameTouched=!0}} placeholder="p.ej. cupon-descuento" pattern="[a-z0-9-]+" required></label>
          <button class="btn launch" ?disabled=${this.busy} style="align-self:end">${this.busy?`…`:`Lanzar run`}</button>
        </div>
        <div class="launch-meta">
          ${this.launchModelSummary()}
          <!-- auto-aprobar FUERA del foco primario (doctrina "el experto manda"): opción secundaria y tenue,
               no un toggle junto al CTA. Por defecto OFF = con pausas de revisión. -->
          <label class="lm-auto ${this.auto?`on`:``}" title="Sin pausas de revisión: el pipeline corre de principio a fin. Por defecto OFF — el experto revisa."><input type="checkbox" aria-label="Auto-aprobar: ejecutar sin pausas de revisión" .checked=${this.auto} @change=${e=>{this.auto=e.target.checked}}>ejecutar sin pausas</label>
          ${this.est?h`<details class="lm-estd"><summary class="lm-est">≈ ${l(this.est.total)} tokens · ${this.est.rows.length} fases <span class="muted">· preflight, sin API</span></summary>
            <table class="est-tab">${this.est.rows.map(e=>h`<tr><td>${e.phase}</td><td>↓ ${l(e.estIn)}</td><td>↑ ${l(e.estOut)}</td></tr>`)}</table>
            ${this.est.saved>0?h`<p class="est-saved">Ahorro estimado de ${l(this.est.saved)} tokens de entrada <span class="muted">(el planner no relee el repositorio)</span></p>`:i}
          </details>`:i}
        </div>
        ${n.length?h`
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
            <details class="adv-phases">
              <summary class="muted" style="cursor:pointer;font-size:.78rem;margin-top:.5rem">Por fase (avanzado) — la fase gana al rol</summary>
              <div class="phase-grid" style="margin-top:.45rem">
                ${E.PHASES.map(e=>this.roleSelect(e,this.mPhases[e]??``,t=>{this.mPhases={...this.mPhases,[e]:t},this.preset=``}))}
              </div>
              <p class="muted" style="font-size:.7rem;margin:.4rem 0 0">spec y verify agradecen el modelo más capaz (un error de spec se propaga a todo; verify decide el GREEN) · explore/tasks van sobrados con el económico.</p>
            </details>
            ${this.mixNote()}
            <!-- B5: defaults en el REPO, la web los cambia — persiste la mezcla en openspec/conductor.json -->
            <div class="frow" style="margin-top:.55rem;align-items:center">
              <button type="button" class="btn sm sec" ?disabled=${this.savingDefaults||!(this.mPlanner||this.mCoder||this.mReviewer||Object.values(this.mPhases).some(Boolean))} @click=${()=>void this.saveModelsDefault()} title="Escribe esta mezcla en openspec/conductor.json — será el default del EQUIPO para este proyecto (committeable)">${this.savingDefaults?`…`:h`${p(`save`)} Guardar como default del proyecto`}</button>
              ${this.saveDefaultsMsg?h`<span class="inst-msg ${this.saveDefaultsMsg.startsWith(`✓`)?`ok`:`bad`}" role="status" aria-live="polite" style="margin-top:0">${this.saveDefaultsMsg}</span>`:i}
            </div>
          </div>
        </details>`:i}
        ${this.byokForm()}
      </form>
      ${this.error?h`<p role="alert" style="color:var(--bad)">${this.error}</p>`:i}
    `,c=this.projects.find(e=>e.id===this.projId)??null,d=!c,f=c&&c.openspec===!1?this.initPanel(c):o,m=this.attention();return h`
      <!-- la home ES tu proyecto: el título lleva su nombre (el texto que no orienta se ha podado; la ruta
           vive en el tooltip del selector y la versión del motor en el pliegue de Métricas) -->
      <!-- el h1 SIEMPRE con su chip de rama (petición de producto): sabes contra qué rama lanzas sin mirar la terminal -->
      <div class="apphdr"><h1>${c?c.name:`conductor`}</h1>${c?.branch?h`<span class="chip-branch" title="rama de git del proyecto">⎇ ${c.branch}</span>`:i}</div>
      ${this.routeErr?h`<p class="alert warn" role="status"><span>${this.routeErr}</span></p>`:i}
      ${m.length?h`<div class="attn" role="alert" aria-label="runs que esperan tu decisión">
        ${m.map(({p:e,c:t})=>h`<a class="attn-item" href="/run/${e.id}/${t.name}">${p(`pause`)} <b>${t.name}</b> espera tu decisión${this.projects.length>1?h` <span class="muted">· ${p(`folder`)} ${e.name}</span>`:i}<span class="attn-go">Abrir →</span></a>`)}
      </div>`:i}
      <!-- coste "1 cifra en su momento" (decisión de producto): el desglose vive plegado; la cifra oportuna
           va en el estimate del form (al decidir) y en el run (al terminar). AI Credits queda como única señal ambiente. -->
      <!-- página de PROYECTO: el PROMPT es el HÉROE. Home GLOBAL: el héroe son los PROYECTOS
           (moverse entre ellos en un clic) — se lanza dentro de cada proyecto, no desde la home. -->
      ${d?h`
        <h2 class="sect">Proyectos</h2>
        <div class="proj-grid">
          ${this.projects.map(e=>{let t=e.changes??[],n=t.some(e=>e.pending||u(e.verdict)===`CURSO`),r=t.filter(e=>u(e.verdict)===`GREEN`).length;return h`<a class="proj-card" href="/${e.id}" title="Abrir ${e.name} (URL directa: /${e.id})">
              <span class="pc-head">${p(`folder`)}<b class="pc-name">${e.name}</b>${n?h`<span class="dot CURSO" role="img" aria-label="algo vivo en este proyecto"></span>`:i}</span>
              <span class="pc-sub">${t.length?h`${t.length} run${t.length===1?``:`s`}${r?h` · <span class="pc-g">${r} ✓</span>`:i}`:`Sin runs todavía`}</span>
              <span class="pc-go" aria-hidden="true">Abrir →</span>
            </a>`})}
        </div>
        ${this.projects.length===0?h`<p class="muted">Ningún proyecto registrado todavía — ejecuta <code>conductor init</code> en tu repo y aparecerá aquí.</p>`:i}
      `:f}

      <!-- MÉTRICAS SIEMPRE VISIBLES bajo el formulario (decisión UX: sin pliegue — el pliegue
           las escondía y nadie las abría). Flechas PEGADAS al número (voz de dato), versión discreta al pie. -->
      <section class="metrics-strip" aria-label=${d?`métricas globales`:`métricas del proyecto`}>
        <div class="sectrow"><h2 class="sect">Métricas</h2></div>
        <div class="cards">
          <div class="card"><small>Runs</small><span>${t.total}</span></div>
          <div class="card ok"><small>Green</small><span>${t.green}</span></div>
          ${t.curso>0?h`<div class="card warn"><small>En curso</small><span>${t.curso}</span></div>`:i}
          <div class="card"><small>Tokens entrada</small><span>${t.measured?h`<i class="dir">↓</i>${l(t.tin)}`:`—`}</span></div>
          <div class="card"><small>Tokens salida</small><span>${t.measured?h`<i class="dir">↑</i>${l(t.tout)}`:`—`}</span></div>
          ${this.gh?h`<div class="card aic"><small>AI Credits</small><span>${this.gh.used}/${this.gh.entitlement}</span><div class="pbar ${this.gh.percentUsed>80?`warn`:``}"><i style="width:${Math.min(100,this.gh.percentUsed)}%"></i></div></div>`:i}
          ${this.usage?h`<div class="card"><small>Uso total LiteLLM</small><span>$${this.usage.spend.toFixed(2)}${this.usage.budget?h` <span class="muted" style="font-size:.8rem;font-weight:500">/ $${this.usage.budget.toFixed(0)}</span>`:i}</span>${this.usage.budget?h`<div class="pbar ${this.usage.spend/this.usage.budget>.8?`warn`:``}"><i style="width:${Math.min(100,this.usage.spend/this.usage.budget*100)}%"></i></div>`:i}</div>`:i}
        </div>
        ${!t.measured&&t.total?h`<p class="metrics-foot">tokens sin medir en estos runs</p>`:i}
      </section>

      ${r.length>0?h`
        <h2 class="sect">En curso</h2>
        ${r.map(({p:e,c:t})=>this.runRow(e,t))}
      `:i}

      <!-- UN SOLO input de búsqueda en posición estable: al teclear, this.q cambia y el re-render antes
           DESMONTABA el input de "Historial" y MONTABA el de "Búsqueda" (nodos DOM distintos) → se perdía el
           foco tras la 1ª tecla. Ahora el input persiste; solo cambian el título y el contenido de abajo. -->
      ${a.length>0||this.q.trim()?h`
        <div class="sectrow">
          <h2 class="sect">${this.q.trim()?`Búsqueda`:`Historial`}</h2>
          <input class="search" type="search" placeholder="Buscar" .value=${this.q} @input=${e=>this.onSearch(e)} aria-label="buscar runs y cambios archivados">
        </div>
        ${this.q.trim()?h`<p class="muted" style="font-size:.78rem;margin:.2rem 0 .6rem">${this.hits.length} resultado${this.hits.length===1?``:`s`} para "${this.q}"</p>${this.hits.map(e=>this.hitRow(e))}`:a.map(({p:e,c:t})=>this.runRow(e,t))}
      `:i}

      ${t.total===0?h`<p class="muted" style="margin-top:.5rem">Aún no hay runs. Lanza el primero arriba.</p>`:i}

      ${!d&&this.archived.length?h`
        <details class="arch">
          <summary>${p(`archive`)} Archivados <span class="muted">· ${this.archived.length}</span></summary>
          ${this.archived.map(e=>h`
            <div class="arch-row">
              <status-pill .verdict=${e.verdict}></status-pill>
              <span class="nm">${e.name}</span>
              ${e.project?h`<span class="proj">${p(`folder`)} ${e.project}</span>`:i}
              <span class="muted">${e.date??``} · ${e.phases} fases · ${e.request}</span>
            </div>`)}
        </details>`:i}
    `}hitRow(e){let t=h`<status-pill .verdict=${e.verdict}></status-pill><span class="nm">${e.name}</span>${e.archived?h`<span class="tag" title="archivado">${p(`archive`)}</span>`:i}${e.project?h`<span class="proj">${p(`folder`)} ${e.project}</span>`:i}<span class="muted snip">…${e.snippet}…</span>`;return h`<div class="hit-row">${e.archived?t:h`<a class="hit-main" href="/run/${e.projectId??this.defProjId}/${e.name}">${t}</a>`}</div>`}launchModelSummary(){let e=e=>e.replace(/^(byok|copilot):/,``),t=Object.entries(this.mPhases).filter(([,e])=>e),n=[this.mPlanner,this.mCoder,this.mReviewer,...t.map(([,e])=>e)].filter(Boolean);if(!n.length)return i;let r=t.map(([t,n])=>`${t} ${e(n)}`).join(` · `);return h`<span class="lm-model" title="modelo elegido por fase — cámbialo en «Modelo por fase»">Modelo: <b>${n.every(e=>e===n[0])&&!r?e(n[0]):[[this.mPlanner,this.mCoder,this.mReviewer].some(Boolean)?`planner ${e(this.mPlanner)||`—`} · coder ${e(this.mCoder)||`—`} · reviewer ${e(this.mReviewer)||`—`}`:``,r].filter(Boolean).join(` · `)}</b></span>`}mixNote(){let e=e=>e?e.startsWith(`byok:`)?`LiteLLM`:e.startsWith(`copilot:`)?`Copilot`:`sesión`:``,t=[...new Set([this.mPlanner,this.mCoder,this.mReviewer,...Object.values(this.mPhases)].map(e).filter(Boolean))];return t.length<2?i:h`<div class="muted" style="font-size:.72rem;margin-top:.5rem">proveedores: ${t.join(` + `)}</div>`}roleSelect(e,t,n){let r=this.models,a=r?.copilot??[],o=r?.byok??[],s=!!r?.byokCreds,c=e=>e.startsWith(`claude`)?`Claude`:e.startsWith(`gpt`)?`GPT`:e.startsWith(`gemini`)?`Gemini`:`Otros`,l=e=>r?.vendors?.[e]??c(e),u=r?.tiers??{},d=[`Anthropic`,`Claude`,`OpenAI`,`GPT`,`Google`,`Gemini`],f=[...new Set(a.map(l))].sort((e,t)=>{let n=d.indexOf(e),r=d.indexOf(t);return(n<0?99:n)-(r<0?99:r)||e.localeCompare(t)}).map(e=>[e,a.filter(t=>l(t)===e).sort((e,t)=>this.tierRank(u[t])-this.tierRank(u[e])||t.localeCompare(e))]).filter(([,e])=>e.length),p=r?.copilotPending;return h`<label class="fl" style="flex:1">${e}<select .value=${t} title=${r?`Copilot: ${r.copilotSource} · LiteLLM: ${r.byokSource}`:``} @change=${e=>n(e.target.value)}>
      <option value="">Recomendado (conductor elige)</option>
      ${f.length?f.map(([e,t])=>h`<optgroup label="Copilot · ${e}${p?` · vistos en tus runs`:``}">${t.map(e=>h`<option value="copilot:${e}">${this.modelLabel(e,`copilot`)}</option>`)}</optgroup>`):h`<option value="" disabled>catálogo Copilot aún no disponible</option>`}
      ${s&&o.length?h`<optgroup label="LiteLLM · 0 créditos">${o.map(e=>h`<option value="byok:${e}">${this.modelLabel(e,`byok`)}</option>`)}</optgroup>`:i}
    </select></label>`}runRow(e,t){return h`
      <div class="run-row ${u(t.verdict)===`CURSO`?`run-active`:``}">
        <div class="run-l">
          <a class="main" href="/run/${e.id}/${t.name}">
            <span class="nm">${t.name} <status-pill .verdict=${t.pending?`EN PAUSA`:t.verdict}></status-pill>${t.pending?h`<span class="pill CURSO" title="el run espera tu revisión">${p(`pause`)} tu decisión</span>`:i}</span>
            <span class="rq">${t.request}</span>
            <span class="proj">${p(`folder`)} ${e.name}</span>
          </a>
          <div class="run-foot">
            <span class="meta">${t.phases} fases${(t.tokens?.in??0)+(t.tokens?.out??0)>0?h` · ↓ ${l(t.tokens?.in)} entrada · ↑ ${l(t.tokens?.out)} salida`:i}</span>
            <!-- sistema visual: la ÚNICA primaria del panel es «Lanzar run» — las
                 acciones del historial hablan en voz secundaria, sin emojis ni colores propios -->
            ${t.resumable?h`<button class="btn sm sec" @click=${()=>void this.resume(e,t)} aria-label="reanudar ${t.name}">${p(`play`)} Reanudar</button>`:i}
            ${!t.resumable&&u(t.verdict)!==`CURSO`&&t.request?h`<button class="btn sm sec" @click=${()=>this.reuse(t)} title="rellena el formulario con esta petición para lanzar una variante">${p(`redo`)} Reutilizar</button>`:i}
            ${t.hasDashboard?h`<a class="btn sm sec" href="/artifact/${e.id}/${t.name}/dashboard.html" target="_blank" aria-label="informe de ${t.name}" title="Informe del run: fases con modelo y tokens reales vs estimados, gate y linaje requisito→código→test.">${p(`report`)} Informe</a>`:i}
            ${t.phases>0?h`<a class="btn sm sec" href="/api/run/${e.id}/${t.name}/aiact" target="_blank" aria-label="AI Act de ${t.name}" title="El acta de «quién hizo qué» que pide el reglamento europeo de IA: modelos y papel por fase, aprobaciones humanas y sello.">${p(`shield`)} AI Act</a>`:i}
          </div>
        </div>
        <a class="run-open" href="/run/${e.id}/${t.name}" tabindex="-1" aria-hidden="true"><span class="chev" aria-hidden="true"></span></a>
      </div>`}};m([d()],N.prototype,`projects`,void 0),m([d()],N.prototype,`gh`,void 0),m([d()],N.prototype,`usage`,void 0),m([d()],N.prototype,`models`,void 0),m([d()],N.prototype,`req`,void 0),m([d()],N.prototype,`name`,void 0),m([d()],N.prototype,`complexity`,void 0),m([d()],N.prototype,`auto`,void 0),m([c()],N.prototype,`routeProj`,void 0),m([d()],N.prototype,`routeErr`,void 0),m([d()],N.prototype,`loadedOnce`,void 0),m([d()],N.prototype,`projId`,void 0),m([d()],N.prototype,`mPlanner`,void 0),m([d()],N.prototype,`mCoder`,void 0),m([d()],N.prototype,`mReviewer`,void 0),m([d()],N.prototype,`mPhases`,void 0),m([d()],N.prototype,`preset`,void 0),m([d()],N.prototype,`busy`,void 0),m([d()],N.prototype,`error`,void 0),m([d()],N.prototype,`atts`,void 0),m([d()],N.prototype,`savingDefaults`,void 0),m([d()],N.prototype,`saveDefaultsMsg`,void 0),m([d()],N.prototype,`est`,void 0),m([d()],N.prototype,`phaseSel`,void 0),m([d()],N.prototype,`runTests`,void 0),m([d()],N.prototype,`initBusy`,void 0),m([d()],N.prototype,`q`,void 0),m([d()],N.prototype,`hits`,void 0),m([d()],N.prototype,`archived`,void 0),N=E=m([a(`panel-screen`)],N);export{N as PanelScreen,k as smartName};
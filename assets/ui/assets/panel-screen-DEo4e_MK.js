import{a as e,c as t,d as n,f as r,g as i,h as a,l as o,m as s,n as c,o as l,p as u,r as d,t as f,u as p}from"./index-BbJHMIIU.js";import"./status-pill-BS_o-L20.js";var m={ATTRIBUTE:1,CHILD:2,PROPERTY:3,BOOLEAN_ATTRIBUTE:4,EVENT:5,ELEMENT:6},h=e=>(...t)=>({_$litDirective$:e,values:t}),g=class{constructor(e){}get _$AU(){return this._$AM._$AU}_$AT(e,t,n){this._$Ct=e,this._$AM=t,this._$Ci=n}_$AS(e,t){return this.update(e,t)}update(e,t){return this.render(...t)}},{I:_}=i,v=e=>e.strings===void 0,y={},b=(e,t=y)=>e._$AH=t,x=h(class extends g{constructor(e){if(super(e),e.type!==m.PROPERTY&&e.type!==m.ATTRIBUTE&&e.type!==m.BOOLEAN_ATTRIBUTE)throw Error("The `live` directive is not allowed on child or event bindings");if(!v(e))throw Error("`live` bindings can only contain a single expression")}render(e){return e}update(e,[t]){if(t===s||t===u)return t;let n=e.element,r=e.name;if(e.type===m.PROPERTY){if(t===n[r])return s}else if(e.type===m.BOOLEAN_ATTRIBUTE){if(!!t===n.hasAttribute(r))return s}else if(e.type===m.ATTRIBUTE&&n.getAttribute(r)===t+``)return s;return b(e),t}}),S=class extends o{constructor(...e){super(...e),this.value=``,this.projId=``,this.placeholder=``,this.rows=3,this.open=!1,this.items=[],this.index=0,this.kind=`@`,this.query=``,this.tokStart=0,this.timer=0,this.seq=0,this.pendingCaret=null,this.skillsCache=null}disconnectedCallback(){super.disconnectedCallback(),clearTimeout(this.timer)}emit(e){this.dispatchEvent(new CustomEvent(`cdr-input`,{detail:{value:e},bubbles:!0,composed:!0}))}close(){this.open=!1,this.items=[],clearTimeout(this.timer)}onInput(e){let t=e.target;this.emit(t.value);let n=t.value.slice(0,t.selectionStart).match(/(^|\s)(?:@([^\s@]*)|\/([^\s@/]*))$/);if(!n){this.close();return}let r=n[2]!==void 0;this.kind=r?`@`:`/`,this.query=r?n[2]:n[3],this.tokStart=t.selectionStart-this.query.length-1,this.open=!0,this.index=0,clearTimeout(this.timer),this.timer=window.setTimeout(()=>void this.fetchItems(),130)}async fetchItems(){let e=++this.seq;try{let t=new URLSearchParams;if(this.projId&&t.set(`project`,this.projId),this.kind===`@`){t.set(`q`,this.query);let n=await(await fetch(`/api/files?`+t)).json();if(e!==this.seq)return;this.items=(n.files||[]).slice(0,30).map(e=>({v:e,label:e}))}else{if(this.skillsCache||=(await(await fetch(`/api/skills?`+t)).json()).skills||[],e!==this.seq)return;let n=this.query.toLowerCase();this.items=(this.skillsCache||[]).filter(e=>!n||e.name.toLowerCase().includes(n)).slice(0,20).map(e=>({v:e.name,label:e.name,sub:e.title}))}this.index=0}catch{this.items=[]}}onKey(e){this.open&&(e.key===`ArrowDown`?(e.preventDefault(),this.items.length&&(this.index=(this.index+1)%this.items.length)):e.key===`ArrowUp`?(e.preventDefault(),this.items.length&&(this.index=(this.index-1+this.items.length)%this.items.length)):(e.key===`Enter`||e.key===`Tab`)&&this.items.length?(e.preventDefault(),this.insert(this.items[this.index])):e.key===`Escape`&&(e.preventDefault(),this.close()))}insert(e){let t=this.querySelector(`textarea`);if(!t)return;let n=t.selectionStart,r=this.kind===`@`&&/\s/.test(e.v)?`"`+e.v+`"`:e.v,i=this.kind+r,a=t.value.slice(0,this.tokStart)+i+` `+t.value.slice(n),o=this.tokStart+i.length+1;this.value=a,this.pendingCaret=o,this.emit(a),this.close()}updated(){if(this.pendingCaret==null)return;let e=this.querySelector(`textarea`);e&&(e.focus(),e.setSelectionRange(this.pendingCaret,this.pendingCaret)),this.pendingCaret=null}render(){return a`
      <div class="mi-wrap">
        <textarea class="mi-ta" rows=${this.rows} placeholder=${this.placeholder} .value=${x(this.value)} required
          role="combobox" aria-autocomplete="list" aria-expanded=${this.open?`true`:`false`}
          aria-controls="mi-menu" aria-activedescendant=${this.open&&this.items.length?`mi-opt-`+this.index:u}
          @input=${e=>this.onInput(e)} @keydown=${e=>this.onKey(e)}
          @blur=${()=>{this.timer=window.setTimeout(()=>{this.open=!1},130)}}></textarea>
        ${this.open?a`
          <ul id="mi-menu" class="mi-menu" role="listbox" aria-label=${this.kind===`@`?`ficheros`:`skills`}>
            <li class="mi-head">${this.kind===`@`?`FICHERO PARA CONTEXTO`:`SKILL DEL EQUIPO`}</li>
            ${this.items.length?this.items.map((e,t)=>a`
              <li id=${`mi-opt-`+t} role="option" aria-selected=${t===this.index?`true`:`false`} class="mi-item ${t===this.index?`on`:``}"
                @mousemove=${()=>{this.index=t}} @mousedown=${t=>{t.preventDefault(),this.insert(e)}}>
                <span class="mi-trig">${this.kind}</span><span class="mi-lbl">${e.label}</span>${e.sub?a`<span class="mi-sub">${e.sub}</span>`:u}
              </li>`):a`<li class="mi-empty">Sin resultados para "${this.query}"</li>`}
          </ul>`:u}
      </div>`}};f([n()],S.prototype,`value`,void 0),f([n()],S.prototype,`projId`,void 0),f([n()],S.prototype,`placeholder`,void 0),f([n({type:Number})],S.prototype,`rows`,void 0),f([p()],S.prototype,`open`,void 0),f([p()],S.prototype,`items`,void 0),f([p()],S.prototype,`index`,void 0),S=f([r(`mention-input`)],S);var C={explore:{artifact:`exploration.md`},propose:{artifact:`proposal.md`},clarify:{artifact:`questions.md`},spec:{artifact:`spec.md`,gate:`estructura + escenarios`},design:{artifact:`design.md`},tasks:{artifact:`tasks.md`},apply:{artifact:`código + tests`,gate:`secretos · trazabilidad`},verify:{artifact:`verify-report.md`,gate:`gate determinista (innegociable)`},fix:{artifact:`apply-report.md`}},w=[`explore`,`propose`,`clarify`,`spec`,`design`,`tasks`,`apply`,`verify`],T=[`spec`,`apply`,`verify`],E=class extends o{constructor(...e){super(...e),this.projects=[],this.gh=null,this.usage=null,this.version=``,this.models=null,this.req=``,this.name=``,this.complexity=`medium`,this.auto=!1,this.projId=``,this.mPlanner=``,this.mCoder=``,this.mReviewer=``,this.preset=``,this.busy=!1,this.showAll=!1,this.error=``,this.byokUrl=``,this.byokKey=``,this.byokSaving=!1,this.byokMsg=``,this.est=null,this.phaseSel=[],this.runTests=!1,this.initBusy=!1,this.initMsg=``,this.pipelineTouched=!1,this.estSeq=0,this.proposedPlan=[],this.q=``,this.hits=[],this.archived=[],this.defProjId=``,this.estTimer=null,this.searchTimer=null,this.liveTimer=null,this.api=new l(`/api/`),this.projIdInit=!1,this.nameTouched=!1}connectedCallback(){super.connectedCallback(),this.load(),this.liveTimer=setInterval(()=>void this.refreshChanges(),5e3)}disconnectedCallback(){super.disconnectedCallback(),this.liveTimer&&clearInterval(this.liveTimer)}async load(){await this.refreshChanges();try{this.archived=(await this.api.archive()).archive??[]}catch{}try{this.models=await this.api.models()}catch{}}async refreshChanges(){try{let e=await this.api.changes();this.projects=e.projects??[],this.gh=e.ghUsage??null,this.usage=e.usage??null,this.version=e.version??``;let t=e.projectId||this.projects.find(t=>t.name===e.project)?.id||this.projects[0]?.id||``;if(this.defProjId=t,!this.projIdInit){let e=e=>!!e&&this.projects.some(t=>t.id===e),n=null;try{n=new URLSearchParams(location.search).get(`project`)}catch{}let r=null;try{r=localStorage.getItem(`conductor.activeProject`)}catch{}this.projId=[n,r,t].find(t=>e(t))||t,this.projIdInit=!0,this.persistActive()}}catch{}}persistActive(){try{this.projId&&localStorage.setItem(`conductor.activeProject`,this.projId)}catch{}}onReq(e){this.req=e,this.nameTouched||(this.name=d(this.req.replace(/[@/]\S+/g,` `).split(/\s+/).slice(0,6).join(` `))),this.scheduleEstimate()}scheduleEstimate(){this.estTimer&&clearTimeout(this.estTimer),this.estTimer=setTimeout(()=>void this.fetchEstimate(),350)}async fetchEstimate(){if(!this.req.trim()){this.est=null,this.phaseSel=[],this.pipelineTouched=!1,this.runTests=!1;return}let e=++this.estSeq,t=this.pipelineTouched;try{let n=await this.api.estimate(this.req,t?this.effectivePipeline():void 0);if(e!==this.estSeq)return;this.est={total:n.total,rows:n.phases,saved:n.noRescanSaved,actions:n.actions??[],checks:n.checks??[],testCmd:n.testCmd??null},this.complexity=n.complexity||this.complexity,t||(this.phaseSel=n.phases.map(e=>e.phase),this.proposedPlan=n.phases.map(e=>e.phase)),n.testCmd||(this.runTests=!1)}catch{}}effectivePipeline(){let e=new Set([...this.phaseSel,...T]);return w.filter(t=>e.has(t))}togglePhase(e){if(T.includes(e))return;this.pipelineTouched=!0;let t=this.phaseSel.includes(e)?this.phaseSel.filter(t=>t!==e):[...this.phaseSel,e];this.phaseSel=w.filter(e=>t.includes(e)),this.scheduleEstimate()}resetPipeline(){this.pipelineTouched=!1,this.proposedPlan.length&&(this.phaseSel=[...this.proposedPlan]),this.scheduleEstimate()}pipelineForLaunch(){return this.pipelineTouched?this.effectivePipeline():void 0}onSearch(e){this.q=e.target.value,this.searchTimer&&clearTimeout(this.searchTimer),this.searchTimer=setTimeout(()=>void this.runSearch(),280)}async runSearch(){if(!this.q.trim()){this.hits=[];return}try{this.hits=(await this.api.search(this.q)).hits??[]}catch{}}async launch(e){if(e.preventDefault(),!this.req.trim()||!this.name){this.error=`Indica la petición y el nombre del cambio`;return}this.busy=!0,this.error=``;let n={};this.mPlanner&&(n.planner=this.mPlanner),this.mCoder&&(n.coder=this.mCoder),this.mReviewer&&(n.reviewer=this.mReviewer);try{let e=await this.api.launch({request:this.req,name:d(this.name),complexity:this.complexity,auto:this.auto,projectId:this.projId||void 0,models:Object.keys(n).length?n:void 0,pipeline:this.pipelineForLaunch(),runTests:this.runTests});if(e.ok&&e.url){t.go(e.url);return}if(e.needsInit){await this.refreshChanges(),this.error=``;return}this.error=e.error??`no se pudo lanzar`}catch(e){this.error=e.message}finally{this.busy=!1}}async doInit(){this.initBusy=!0,this.initMsg=``;try{let e=await this.api.init(this.projId||void 0);e.ok?await this.refreshChanges():this.initMsg=e.error??`no se pudo inicializar`}catch(e){this.initMsg=e.message}finally{this.initBusy=!1}}initPanel(e){return a`
      <div class="launch-init" style="padding:1rem 1.1rem;border:1px solid var(--bd);border-left:3px solid var(--accent);border-radius:var(--r);background:var(--accentbg);color:var(--tx)">
        <h2 style="margin:0 0 .3rem;font-size:1rem;font-weight:600">Este proyecto no está inicializado</h2>
        <p class="muted" style="margin:0 0 .25rem;font-size:.86rem"><strong style="font-weight:600">${e.name}</strong> aún no tiene SDD configurado. Inicialízalo para poder lanzar features con gobierno (spec · apply · verify).</p>
        <p class="muted" style="margin:0 0 .7rem;font-size:.78rem">Crea <code>openspec/</code> con la config del pipeline, el esquema y <code>.copilotignore</code> (ahorro de tokens). No toca tu código.</p>
        <button class="btn" ?disabled=${this.initBusy} @click=${()=>void this.doInit()}>${this.initBusy?`Inicializando…`:`Inicializar este proyecto`}</button>
        ${this.initMsg?a`<p role="alert" style="margin:.55rem 0 0;font-size:.82rem;color:var(--bad)">${this.initMsg}</p>`:u}
      </div>`}async resume(e,n){let r=await this.api.resumeNamed(n.name,e.id);r.ok&&r.url&&t.go(r.url)}metrics(t){let n=t.flatMap(e=>e.changes??[]);return{total:n.length,green:n.filter(t=>e(t.verdict)===`GREEN`).length,curso:n.filter(t=>e(t.verdict)===`CURSO`).length,tin:n.reduce((e,t)=>e+(t.tokens?.in??0),0),tout:n.reduce((e,t)=>e+(t.tokens?.out??0),0)}}activeProject(){return this.projects.find(e=>e.id===this.projId)??null}scopeProjects(){if(this.showAll)return this.projects;let e=this.activeProject();return e?[e]:this.projects}switchProject(e){!e||e===this.projId||(this.projId=e,this.persistActive(),this.refreshChanges())}projectSwitcher(){return this.projects.length<=1?u:a`<label class="fl" style="display:inline-flex;flex-flow:row wrap;align-items:center;gap:.45rem;margin:0 0 1rem;font-size:.82rem">Proyecto
      <select aria-label="Proyecto activo" @change=${e=>this.switchProject(e.target.value)} style="min-width:12rem">
        ${this.projects.map(e=>a`<option value=${e.id} ?selected=${e.id===this.projId}>${e.name}${e.openspec===!1?` · sin inicializar`:``}</option>`)}
      </select></label>`}modelOptions(){let e=this.models;return e?[...e.byokCreds?e.byok.map(e=>`byok:`+e):[],...e.copilot.map(e=>`copilot:`+e)]:[]}tierRank(e){return e===`premium`?3:e===`economy`?1:2}applyPreset(e){if(this.preset=e,e===`clear`){this.mPlanner=``,this.mCoder=``,this.mReviewer=``;return}let t=this.models;if(!t)return;let n=t.tiers??{},r=[...t.copilot],i=r.length?`copilot:`+[...r].sort((e,t)=>this.tierRank(n[e])-this.tierRank(n[t]))[0]:``,a=r.length?`copilot:`+[...r].sort((e,t)=>this.tierRank(n[t])-this.tierRank(n[e]))[0]:``,o=``,s=``,c=``;if(e===`quality`)o=s=c=a;else{let e=r.filter(e=>n[e]!==`premium`),a=e.length?e:r,l=a.length?`copilot:`+[...a].sort((e,t)=>this.tierRank(n[t])-this.tierRank(n[e]))[0]:``,u=t.byok.length?`byok:`+[...t.byok].sort((e,t)=>this.tierRank(n[e])-this.tierRank(n[t]))[0]:``;s=t.byokCreds&&t.byok.length>0?u:i,o=i,c=l||i}let l=this.modelOptions(),u=e=>e&&l.includes(e)?e:``;this.mPlanner=u(o),this.mCoder=u(s),this.mReviewer=u(c)}async byokSave(e){e.preventDefault();let t=(this.byokUrl||this.models?.byokUrl||``).trim(),n=this.byokKey.trim();if(!(!t||!n)){this.byokSaving=!0,this.byokMsg=``;try{let e=await(await fetch(`/api/byok/save`,{method:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify({url:t,key:n})})).json();if(e.ok){this.byokMsg=`✓ Guardado`,this.byokKey=``,this.models=null;try{this.models=await this.api.models()}catch{}}else this.byokMsg=e.error??`Error al guardar`}catch(e){let t=e;this.byokMsg=t instanceof TypeError?`No se pudo conectar con el servidor local. Comprueba que la aplicación está en ejecución.`:String(t.message)}finally{this.byokSaving=!1}}}byokHost(){let e=this.models?.byokUrl||this.byokUrl;try{return new URL(e).host}catch{return e||`LiteLLM`}}byokForm(){let e=!!this.models?.byokCreds,t=this.byokMsg?a`<div class="inst-msg ${this.byokMsg.startsWith(`✓`)?`ok`:`bad`}" role="status" aria-live="polite">${this.byokMsg.replace(/^✓\s*/,``)}</div>`:u;return e?a`
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
              <div class="ro-row"><dt>Credencial</dt><dd>Cifrada en tu equipo (DPAPI)</dd></div>
              <div class="ro-row"><dt>Privacidad</dt><dd>Nunca sale de tu máquina · no se registra</dd></div>
            </dl>
            <p class="inst-note">La clave se guarda <strong>cifrada con DPAPI</strong> (solo tu usuario de Windows puede descifrarla) en <code>~/.conductor/byok.json</code>. <strong>Nunca sale de tu equipo</strong>, no aparece en logs ni en comandos, y no se cachea — solo se guardan los nombres de los modelos. Se mantiene entre sesiones; cámbiala solo si caduca.</p>
            <form class="frow" style="align-items:end" @submit=${e=>void this.byokSave(e)}>
              <label class="fl" style="flex:2;min-width:12rem">Nueva API Key<input type="password" .value=${this.byokKey} @input=${e=>{this.byokKey=e.target.value}} placeholder="sk-… (solo si caducó)" autocomplete="off"></label>
              <button class="btn sm sec" ?disabled=${this.byokSaving||!this.byokKey.trim()} style="align-self:end">${this.byokSaving?`…`:`Actualizar clave`}</button>
            </form>
            ${t}
          </div>
        </details>`:a`
      <details class="inst-panel inst-prompt" style="margin-top:.6rem">
        <summary class="inst-head">
          <span class="inst-led on-warn" aria-hidden="true"></span>
          <span class="inst-title">Conectar qwen · LiteLLM</span>
          <span class="inst-status warn">Configuración única</span>
          <span class="inst-chev" aria-hidden="true"></span>
        </summary>
        <div class="inst-body">
          <p class="inst-note">Conecta tu proxy LiteLLM <strong>una sola vez</strong> para usar qwen (más barato) en las fases que elijas. La clave se guarda <strong>cifrada con DPAPI</strong> en tu equipo (solo tu usuario la descifra), <strong>nunca sale de tu máquina</strong>, no se registra ni se cachea (solo los nombres de modelos). No la vuelves a meter.</p>
          <form class="frow" style="align-items:end" @submit=${e=>void this.byokSave(e)}>
            <label class="fl" style="flex:2;min-width:12rem">URL LiteLLM<input type="url" .value=${this.byokUrl} @input=${e=>{this.byokUrl=e.target.value}} placeholder="https://…/v1" required></label>
            <label class="fl" style="flex:2;min-width:10rem">API Key<input type="password" .value=${this.byokKey} @input=${e=>{this.byokKey=e.target.value}} placeholder="sk-…" autocomplete="off" required></label>
            <button class="btn sm" ?disabled=${this.byokSaving} style="align-self:end">${this.byokSaving?`…`:`Guardar`}</button>
          </form>
          ${t}
        </div>
      </details>`}planPanel(){let e=this.est?.checks??[],t=e.filter(e=>e.always),n=e.filter(e=>!e.always),r=new Set(this.phaseSel);return a`
      <div class="launch-plan" style="margin:.1rem 0 .2rem;padding:.7rem .9rem;border-left:3px solid var(--accent);background:var(--accentbg);border-radius:7px;color:var(--tx)">
        <div style="display:flex;align-items:baseline;justify-content:space-between;gap:.6rem">
          <span style="font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;color:var(--tx2);font-weight:600">Plan · fases SDD (OpenSpec)</span>
          ${this.pipelineTouched?a`<button type="button" @click=${()=>this.resetPipeline()} style="background:none;border:none;padding:0;font-size:.74rem;color:var(--accent,#4f7cff);cursor:pointer;text-decoration:underline">restablecer plan propuesto</button>`:u}
        </div>
        <p class="muted" style="margin:.2rem 0 .1rem;font-size:.74rem">Marca las fases que se ejecutarán. <strong style="font-weight:600">spec · apply · verify</strong> son obligatorias (gobierno).</p>
        <ul role="group" aria-label="Fases SDD del run" style="margin:.35rem 0 0;padding:0;list-style:none;font-size:.85rem;line-height:1.5">
          ${w.map(e=>{let t=C[e],n=T.includes(e),i=n||r.has(e);return a`<li style="padding:.12rem 0">
              <label style="display:flex;align-items:center;gap:.45rem;cursor:${n?`default`:`pointer`};${i?``:`opacity:.5`}">
                <input type="checkbox" .checked=${i} ?disabled=${n} @change=${()=>this.togglePhase(e)} aria-label="${e}${n?` (obligatoria, no se puede quitar)`:` (opcional)`}">
                <strong style="font-weight:600">${e}</strong>
                ${n?a`<span title="obligatoria — gobierno innegociable" aria-hidden="true">🔒</span>`:u}
                ${t?.artifact?a`<span class="muted" style="font-weight:400">→ ${t.artifact}</span>`:u}
                ${t?.gate?a`<span class="muted" style="font-weight:400">· ${t.gate}</span>`:u}
              </label>
            </li>`})}
        </ul>
        <div style="margin-top:.5rem;padding-top:.5rem;border-top:1px dashed var(--bd,#d8dee9)">
          <label style="display:flex;align-items:center;gap:.45rem;cursor:${this.est?.testCmd?`pointer`:`not-allowed`};${this.est?.testCmd?``:`opacity:.5`}" title=${this.est?.testCmd?`Ejecuta las pruebas REALES del proyecto ANTES de verify. Si fallan → ciclo fix → reintenta; si no pasan tras N intentos, el run queda BLOCKED.`:`No se detectó comando de pruebas en este proyecto`}>
            <input type="checkbox" .checked=${this.runTests} ?disabled=${!this.est?.testCmd} @change=${e=>{this.runTests=e.target.checked}} aria-label="ejecutar las pruebas del proyecto tras el gate (opcional)">
            <strong style="font-weight:600">test</strong>
            ${this.est?.testCmd?a`<span class="muted" style="font-weight:400">→ ejecutar pruebas del proyecto · <code style="font-size:.85em">${this.est.testCmd}</code></span>`:a`<span class="muted" style="font-weight:400">→ sin comando de pruebas detectado</span>`}
          </label>
          <p class="muted" style="margin:.1rem 0 0 1.55rem;font-size:.72rem">Opcional · corre ANTES de verify (apply → test → fix → verify). Si fallan, reintenta con fix; si no pasan, BLOCKED.</p>
        </div>
        ${t.length?a`
          <div style="margin-top:.5rem;font-size:.82rem"><span class="muted">Comprobaré:</span></div>
          <ul style="margin:.2rem 0 0;padding-left:1.15rem;font-size:.82rem;line-height:1.5">
            ${t.map(e=>a`<li>${e.label}</li>`)}
          </ul>`:u}
        ${n.length?a`
          <div style="margin-top:.45rem;font-size:.82rem"><span class="muted">Recomendado para este cambio</span> <span class="muted" style="font-size:.76rem">· actívalo en openspec/conductor.json</span></div>
          <ul style="margin:.2rem 0 0;padding-left:1.15rem;font-size:.82rem;line-height:1.5">
            ${n.map(e=>a`<li>${e.label}${e.why?a` <span class="muted">— ${e.why}</span>`:u}</li>`)}
          </ul>`:u}
      </div>`}render(){let t=this.scopeProjects(),n=this.metrics(t),r=this.modelOptions(),i=t.flatMap(t=>(t.changes??[]).filter(t=>e(t.verdict)===`CURSO`).map(e=>({p:t,c:e}))),o=t.flatMap(t=>(t.changes??[]).filter(t=>e(t.verdict)!==`CURSO`).map(e=>({p:t,c:e}))),s=a`
      <form class="launch-form" @submit=${e=>void this.launch(e)}>
        <label class="fl">Qué quieres construir
          <mention-input .value=${this.req} .projId=${this.projId} placeholder="Describe el cambio en una frase o pega una spec. Escribe @ para dar contexto de un fichero · / para aplicar una skill del equipo" @cdr-input=${e=>this.onReq(e.detail.value)}></mention-input>
        </label>
        ${this.req.trim()&&this.est?this.planPanel():u}
        <div class="frow">
          <label class="fl" style="flex:1;min-width:10rem" title="Cómo se llamará esta tarea (auto-sugerido a partir de tu descripción; edítalo si quieres).">Nombre<input .value=${this.name} @input=${e=>{this.name=e.target.value,this.nameTouched=!0}} placeholder="p.ej. cupon-descuento" pattern="[a-z0-9-]+" required></label>
          <label class="fl" title="Sin pausas de revisión: el pipeline corre de principio a fin sin pedirte aprobar cada fase (el experto suele quererlo OFF)">Auto-aprobar<label class="switch"><input type="checkbox" aria-label="Auto-aprobar: ejecutar sin pausas de revisión" .checked=${this.auto} @change=${e=>{this.auto=e.target.checked}}><span></span></label></label>
          <button class="btn" ?disabled=${this.busy} style="align-self:end">${this.busy?`…`:`Lanzar run`}</button>
        </div>
        <div class="launch-meta">
          ${this.launchModelSummary()}
          ${this.est?a`<details class="lm-estd"><summary class="lm-est">≈ ${c(this.est.total)} tokens · ${this.est.rows.length} fases <span class="muted">· preflight, sin API</span></summary>
            <table class="est-tab">${this.est.rows.map(e=>a`<tr><td>${e.phase}</td><td>↓ ${c(e.estIn)}</td><td>↑ ${c(e.estOut)}</td></tr>`)}</table>
            ${this.est.saved>0?a`<p class="est-saved">Ahorro estimado de ${c(this.est.saved)} tokens de entrada <span class="muted">(el planner no relee el repositorio)</span></p>`:u}
          </details>`:u}
        </div>
        ${r.length?a`
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
        </details>`:u}
        ${this.byokForm()}
      </form>
      ${this.error?a`<p role="alert" style="color:var(--bad)">${this.error}</p>`:u}
    `,l=this.projects.find(e=>e.id===this.projId)??null,d=l&&l.openspec===!1?this.initPanel(l):s;return a`
      <div class="apphdr"><h1>Dashboard</h1></div>
      <p class="subhead">
        ${l?a`Proyecto activo: <strong style="font-weight:600;color:var(--tx)">${l.name}</strong> <span style="opacity:.7">· ${l.root}</span>`:a`${this.projects.length} proyecto${this.projects.length===1?``:`s`}`}
        ${this.projects.length>1?a` · <button type="button" @click=${()=>{this.showAll=!this.showAll}} style="background:none;border:none;padding:0;font:inherit;color:var(--accent);cursor:pointer;text-decoration:underline">${this.showAll?`ver solo este`:`ver todos (${this.projects.length})`}</button>`:u}
        · ${n.total} run${n.total===1?``:`s`}${this.showAll?` · todos`:``}${this.version?a` · <span title="versión del motor en uso">motor v${this.version}</span>`:u}
      </p>
      ${this.projectSwitcher()}
      <div class="cards">
        <div class="card"><small>Runs</small><span>${n.total}</span></div>
        <div class="card ok"><small>Green</small><span>${n.green}</span></div>
        ${n.curso>0?a`<div class="card warn"><small>En curso</small><span>${n.curso}</span></div>`:u}
        <div class="card"><small>Tokens entrada ↓</small><span>${c(n.tin)}</span></div>
        <div class="card"><small>Tokens salida ↑</small><span>${c(n.tout)}</span></div>
        ${this.gh?a`<div class="card aic"><small>AI Credits</small><span>${this.gh.used}/${this.gh.entitlement}</span><div class="pbar ${this.gh.percentUsed>80?`warn`:``}"><i style="width:${Math.min(100,this.gh.percentUsed)}%"></i></div></div>`:u}
        ${this.usage?a`<div class="card"><small>Uso total qwen</small><span>$${this.usage.spend.toFixed(2)}${this.usage.budget?a` <span class="muted" style="font-size:.8rem;font-weight:500">/ $${this.usage.budget.toFixed(0)}</span>`:u}</span>${this.usage.budget?a`<div class="pbar ${this.usage.spend/this.usage.budget>.8?`warn`:``}"><i style="width:${Math.min(100,this.usage.spend/this.usage.budget*100)}%"></i></div>`:u}</div>`:u}
      </div>

      ${i.length>0?a`
        <h2 class="sect">En curso</h2>
        ${i.map(({p:e,c:t})=>this.runRow(e,t))}
        <details class="launch-fold" style="margin: 1.1rem 0 .3rem">
          <summary>Nueva funcionalidad</summary>
          ${d}
        </details>
      `:d}

      ${!this.q.trim()&&o.length>0?a`
        <div class="sectrow">
          <h2 class="sect">Historial</h2>
          <input class="search" type="search" placeholder="Buscar" .value=${this.q} @input=${e=>this.onSearch(e)} aria-label="buscar runs y cambios archivados">
        </div>
        ${o.map(({p:e,c:t})=>this.runRow(e,t))}
      `:u}

      ${this.q.trim()?a`
        <div class="sectrow" style="margin-top:.8rem">
          <h2 class="sect">Búsqueda</h2>
          <input class="search" type="search" placeholder="Buscar" .value=${this.q} @input=${e=>this.onSearch(e)} aria-label="buscar runs y cambios archivados">
        </div>
        <p class="muted" style="font-size:.78rem;margin:.2rem 0 .6rem">${this.hits.length} resultado${this.hits.length===1?``:`s`} para "${this.q}"</p>
        ${this.hits.map(e=>this.hitRow(e))}
      `:u}

      ${n.total===0?a`<p class="muted" style="margin-top:.5rem">Aún no hay runs. Lanza el primero arriba.</p>`:u}

      ${this.archived.length?a`
        <details class="arch">
          <summary>📦 Archivados <span class="muted">· ${this.archived.length}</span></summary>
          ${this.archived.map(e=>a`
            <div class="arch-row">
              <status-pill .verdict=${e.verdict}></status-pill>
              <span class="nm">${e.name}</span>
              ${e.project?a`<span class="proj">📁 ${e.project}</span>`:u}
              <span class="muted">${e.date??``} · ${e.phases} fases · ${e.request}</span>
            </div>`)}
        </details>`:u}
    `}hitRow(e){let t=a`<status-pill .verdict=${e.verdict}></status-pill><span class="nm">${e.name}</span>${e.archived?a`<span class="tag">📦</span>`:u}${e.project?a`<span class="proj">📁 ${e.project}</span>`:u}<span class="muted snip">…${e.snippet}…</span>`;return a`<div class="hit-row">${e.archived?t:a`<a class="hit-main" href="/run/${e.projectId??this.defProjId}/${e.name}">${t}</a>`}</div>`}launchModelSummary(){let e=e=>e.replace(/^(byok|copilot):/,``),t=[this.mPlanner,this.mCoder,this.mReviewer];return t.some(Boolean)?a`<span class="lm-model" title="modelo elegido por fase — cámbialo en «Modelo por fase»">Modelo: <b>${t.every(e=>e===t[0])?e(t[0]):`planner ${e(this.mPlanner)||`—`} · coder ${e(this.mCoder)||`—`} · reviewer ${e(this.mReviewer)||`—`}`}</b></span>`:u}mixNote(){let e=[...new Set([this.mPlanner,this.mCoder,this.mReviewer].map(e=>e?e.startsWith(`byok:`)?`qwen`:e.startsWith(`copilot:`)?`Copilot`:`sesión`:``).filter(Boolean))];return e.length<2?u:a`<div class="muted" style="font-size:.72rem;margin-top:.5rem">proveedores: ${e.join(` + `)}</div>`}roleSelect(e,t,n){let r=this.models,i=r?.copilot??[],o=r?.byok??[],s=!!r?.byokCreds,c=e=>e.startsWith(`claude`)?`Claude`:e.startsWith(`gpt`)?`GPT`:e.startsWith(`gemini`)?`Gemini`:`Otros`;return a`<label class="fl" style="flex:1">${e}<select .value=${t} @change=${e=>n(e.target.value)}>
      <option value="">Recomendado (conductor elige)</option>
      ${[`Claude`,`GPT`,`Gemini`,`Otros`].map(e=>[e,i.filter(t=>c(t)===e).sort((e,t)=>t.localeCompare(e))]).filter(([,e])=>e.length).map(([e,t])=>a`<optgroup label="Copilot · ${e}">${t.map(e=>a`<option value="copilot:${e}">${e}</option>`)}</optgroup>`)}
      ${s&&o.length?a`<optgroup label="qwen · LiteLLM">${o.map(e=>a`<option value="byok:${e}">${e}</option>`)}</optgroup>`:u}
    </select></label>`}runRow(t,n){return a`
      <div class="run-row ${e(n.verdict)===`CURSO`?`run-active`:``}">
        <div class="run-l">
          <a class="main" href="/run/${t.id}/${n.name}">
            <span class="nm">${n.name} <status-pill .verdict=${n.verdict}></status-pill></span>
            <span class="rq">${n.request}</span>
            <span class="proj">📁 ${t.name}</span>
          </a>
          <div class="run-foot">
            <span class="meta">${n.phases} fases · ↓ ${c(n.tokens?.in)} entrada · ↑ ${c(n.tokens?.out)} salida</span>
            ${n.resumable?a`<button class="btn sm resume" @click=${()=>void this.resume(t,n)} aria-label="reanudar ${n.name}">⏯ Reanudar</button>`:u}
            ${n.hasDashboard?a`<a class="btn sm dash" href="/artifact/${t.id}/${n.name}/dashboard.html" target="_blank" aria-label="dashboard de ${n.name}">📊 Dashboard</a>`:u}
            ${n.phases>0?a`<a class="btn sm aiact" href="/api/run/${t.id}/${n.name}/aiact" target="_blank" aria-label="AI Act de ${n.name}">🛡 AI Act</a>`:u}
          </div>
        </div>
        <a class="run-open" href="/run/${t.id}/${n.name}" tabindex="-1" aria-hidden="true"><span class="chev" aria-hidden="true"></span></a>
      </div>`}};f([p()],E.prototype,`projects`,void 0),f([p()],E.prototype,`gh`,void 0),f([p()],E.prototype,`usage`,void 0),f([p()],E.prototype,`version`,void 0),f([p()],E.prototype,`models`,void 0),f([p()],E.prototype,`req`,void 0),f([p()],E.prototype,`name`,void 0),f([p()],E.prototype,`complexity`,void 0),f([p()],E.prototype,`auto`,void 0),f([p()],E.prototype,`projId`,void 0),f([p()],E.prototype,`mPlanner`,void 0),f([p()],E.prototype,`mCoder`,void 0),f([p()],E.prototype,`mReviewer`,void 0),f([p()],E.prototype,`preset`,void 0),f([p()],E.prototype,`busy`,void 0),f([p()],E.prototype,`showAll`,void 0),f([p()],E.prototype,`error`,void 0),f([p()],E.prototype,`byokUrl`,void 0),f([p()],E.prototype,`byokKey`,void 0),f([p()],E.prototype,`byokSaving`,void 0),f([p()],E.prototype,`byokMsg`,void 0),f([p()],E.prototype,`est`,void 0),f([p()],E.prototype,`phaseSel`,void 0),f([p()],E.prototype,`runTests`,void 0),f([p()],E.prototype,`initBusy`,void 0),f([p()],E.prototype,`q`,void 0),f([p()],E.prototype,`hits`,void 0),f([p()],E.prototype,`archived`,void 0),E=f([r(`panel-screen`)],E);export{E as PanelScreen};
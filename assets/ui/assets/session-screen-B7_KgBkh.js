import{d as e,f as t,l as n,m as r,o as i,p as a,s as o,t as s,u as c}from"./index-pVSTE7Bz.js";var l=[{key:`tool`,icon:`🔧`,label:`Tools`},{key:`hook`,icon:`🛡`,label:`Hooks`},{key:`message`,icon:`💬`,label:`Mensajes`},{key:`permission`,icon:`🔑`,label:`Permisos`},{key:`subagent`,icon:`🤖`,label:`Subagentes`},{key:`session`,icon:`◆`,label:`Sesión`},{key:`skill`,icon:`✦`,label:`Skills`}],u={...Object.fromEntries(l.map(e=>[e.key,e.icon])),other:`•`},d=class extends n{constructor(...e){super(...e),this.apiBase=`/api/`,this.change=``,this.projId=``,this.data=null,this.err=``,this.cats=new Set,this.q=``,this.limit=250,this.api=new i(`/api/`),this.activeBase=``,this.qTimer=null,this.seq=0}updated(e){this.apiBase&&this.apiBase!==this.activeBase&&(this.activeBase=this.apiBase,this.api=new i(this.apiBase),this.load())}disconnectedCallback(){super.disconnectedCallback(),this.qTimer&&=(clearTimeout(this.qTimer),null),this.seq++}async load(){let e=++this.seq;try{let t=await this.api.events({cat:[...this.cats],q:this.q,limit:this.limit});if(e!==this.seq)return;this.data=t,this.err=``}catch(t){if(e!==this.seq)return;this.err=t.message,this.data=null}}toggleCat(e){let t=new Set(this.cats);t.has(e)?t.delete(e):t.add(e),this.cats=t,this.load()}onSearch(e){this.q=e.target.value,this.qTimer&&clearTimeout(this.qTimer),this.qTimer=setTimeout(()=>void this.load(),250)}runPath(){return this.projId?`/run/${this.projId}/${this.change}`:`/run/${this.change}`}dur(e){if(!e)return`—`;let t=Math.round(e/1e3);return t<60?t+`s`:Math.floor(t/60)+`m `+t%60+`s`}clock(e){if(!e)return``;let t=new Date(e);return Number.isNaN(+t)?``:t.toISOString().slice(11,19)}dchip(e){return e>=1e3?(e/1e3).toFixed(1)+`s`:e+`ms`}render(){if(this.err)return r`<div class="apphdr"><h1 class="trunc">Sesión</h1></div>
        <p class="muted" style="margin-top:.6rem">${/404|sin traza|sin events|no hay/i.test(this.err)?`Este run no dejó traza de sesión (ni del CLI ni telemetría). Aún no ha producido pasos, o se lanzó con un runner que no la emite.`:`No se pudo cargar la traza de sesión de este run.`}</p>
        <p style="margin-top:.8rem"><a class="btn sm sec" href=${this.runPath()}>Volver al run</a></p>`;let e=this.data;if(!e)return o(`Cargando sesión`);let t=e.summary;return r`
      <div class="apphdr"><h1 class="trunc">Sesión · ${this.change}</h1><a class="btn sm sec" href=${this.runPath()}>Volver al run</a></div>
      <p class="muted" style="margin:-.9rem 0 .9rem;font-size:.82rem">
        ${t.start?.branch?r`⎇ ${t.start.branch} · `:a}${this.dur(t.durationMs)} · ${t.total} eventos
        <span class="zero-tok" style="padding:.12rem .5rem;margin-left:.4rem">Visor local · 0 tokens</span>
        ${t.reconstructed?r`<span class="zero-tok" style="padding:.12rem .5rem;margin-left:.4rem" title="Reconstruida desde la telemetría OTel del run (qwen/LiteLLM no emite la traza nativa del CLI)">Reconstruida desde telemetría</span>`:a}
      </p>
      ${t.models.length?r`<p class="se-models"><span class="se-mlbl">Modelos usados</span>${t.models.map(e=>r`<code class="ctx-chip">${e}</code>`)}</p>`:a}
      <div class="se-filters">
        <button class="chip ${this.cats.size===0?`on`:``}" @click=${()=>{this.cats=new Set,this.load()}}>Todo · ${t.total}</button>
        ${l.filter(e=>t.byCategory[e.key]).map(e=>r`<button class="chip ${this.cats.has(e.key)?`on`:``}" @click=${()=>this.toggleCat(e.key)}>${e.icon} ${e.label} · ${t.byCategory[e.key]}</button>`)}
        <input class="search se-q" type="search" placeholder="Buscar en la sesión" .value=${this.q} @input=${e=>this.onSearch(e)} aria-label="buscar eventos de la sesión">
      </div>
      <div class="se-rail" role="list">${e.events.map(e=>this.row(e))}</div>
      ${e.total>e.events.length?r`<button class="btn sm sec" style="margin:.7rem 0" @click=${()=>{this.limit+=250,this.load()}}>cargar más · ${e.events.length}/${e.total}</button>`:a}
      ${e.total===0?r`<p class="muted" style="margin-top:.6rem">Sin eventos para este filtro.</p>`:a}
    `}row(e){return r`<div class="se-row cat-${e.category}" role="listitem" style="--d:${Math.min(e.depth,6)}">
      <span class="se-time">${this.clock(e.ts)}</span>
      <span class="se-ic" aria-hidden="true">${u[e.category]??`•`}</span>
      <span class="se-body">
        <span class="se-lbl">${e.label}</span>
        ${e.detail?r`<span class="se-det">${e.detail}</span>`:a}
      </span>
      ${e.durationMs==null?a:r`<span class="se-dur" title="duración">${this.dchip(e.durationMs)}</span>`}
    </div>`}};s([e()],d.prototype,`apiBase`,void 0),s([e()],d.prototype,`change`,void 0),s([e()],d.prototype,`projId`,void 0),s([c()],d.prototype,`data`,void 0),s([c()],d.prototype,`err`,void 0),s([c()],d.prototype,`cats`,void 0),s([c()],d.prototype,`q`,void 0),s([c()],d.prototype,`limit`,void 0),d=s([t(`session-screen`)],d);export{d as SessionScreen};
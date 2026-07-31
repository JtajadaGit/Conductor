import{_ as e,c as t,d as n,f as r,h as i,l as a,m as o,p as s,t as c}from"./index-DPY_8Dyh.js";var l=[{key:`tool`,icon:`🔧`,label:`Tools`},{key:`hook`,icon:`🛡`,label:`Hooks`},{key:`message`,icon:`💬`,label:`Mensajes`},{key:`permission`,icon:`🔑`,label:`Permisos`},{key:`subagent`,icon:`🤖`,label:`Subagentes`},{key:`session`,icon:`◆`,label:`Sesión`},{key:`skill`,icon:`✦`,label:`Skills`}],u={...Object.fromEntries(l.map(e=>[e.key,e.icon])),other:`•`},d=class extends n{constructor(...e){super(...e),this.apiBase=`/api/`,this.change=``,this.projId=``,this.data=null,this.err=``,this.cats=new Set,this.q=``,this.limit=250,this.api=new t(`/api/`),this.activeBase=``,this.qTimer=null,this.seq=0}updated(e){this.apiBase&&this.apiBase!==this.activeBase&&(this.activeBase=this.apiBase,this.api=new t(this.apiBase),this.load())}disconnectedCallback(){super.disconnectedCallback(),this.qTimer&&=(clearTimeout(this.qTimer),null),this.seq++}async load(){let e=++this.seq;try{let t=await this.api.events({cat:[...this.cats],q:this.q,limit:this.limit});if(e!==this.seq)return;this.data=t,this.err=``}catch(t){if(e!==this.seq)return;this.err=t.message,this.data=null}}async loadMore(){if(!this.data)return;let e=++this.seq,t=this.data.events.length;try{let n=await this.api.events({cat:[...this.cats],q:this.q,limit:this.limit,offset:t});if(e!==this.seq||!this.data)return;this.data={...this.data,events:[...this.data.events,...n.events]}}catch{}}toggleCat(e){let t=new Set(this.cats);t.has(e)?t.delete(e):t.add(e),this.cats=t,this.load()}onSearch(e){this.q=e.target.value,this.qTimer&&clearTimeout(this.qTimer),this.qTimer=setTimeout(()=>void this.load(),250)}runPath(){return this.projId?`/run/${this.projId}/${this.change}`:`/run/${this.change}`}dur(e){if(!e)return`—`;let t=Math.round(e/1e3);return t<60?t+`s`:Math.floor(t/60)+`m `+t%60+`s`}clock(e){if(!e)return``;let t=new Date(e);return Number.isNaN(+t)?``:t.toISOString().slice(11,19)}dchip(e){return e>=1e3?(e/1e3).toFixed(1)+`s`:e+`ms`}render(){if(this.err)return e`<div class="apphdr"><h1 class="trunc">Sesión</h1></div>
        <p class="muted" style="margin-top:.6rem">${/404|sin traza|sin events|no hay/i.test(this.err)?`Este run no dejó traza de sesión (ni del CLI ni telemetría). Aún no ha producido pasos, o se lanzó con un runner que no la emite.`:`No se pudo cargar la traza de sesión de este run.`}</p>
        <p style="margin-top:.8rem"><a class="btn sm sec" href=${this.runPath()}>Volver al run</a></p>`;let t=this.data;if(!t)return a(`Cargando sesión`);if(t.noTrace||!t.summary||t.summary.total===0)return e`<div class="apphdr"><h1 class="trunc">Sesión</h1></div>
        <p class="muted" style="margin-top:.6rem">Este run no dejó traza de sesión (ni del CLI ni telemetría). Aún no ha producido pasos, o se lanzó con un runner que no la emite.</p>
        <p style="margin-top:.8rem"><a class="btn sm sec" href=${this.runPath()}>Volver al run</a></p>`;let n=t.summary;return e`
      <header class="se-head">
        <span class="se-eyebrow">Sesión del agente</span>
        <div class="se-titlerow"><h1 class="trunc">${this.change}</h1><a class="btn sm sec" href=${this.runPath()}>Volver al run</a></div>
        <div class="se-stats">
          ${n.start?.branch?e`<span title="rama de git">⎇ ${n.start.branch}</span>`:i}
          <span title="duración total">${this.dur(n.durationMs)}</span>
          <span>${n.total} eventos</span>
          <span class="zero-tok">Visor local · 0 tokens</span>
          ${n.reconstructed?e`<span class="zero-tok" title="Reconstruida desde la telemetría OTel del run (los modelos LiteLLM no emiten la traza nativa del CLI)">Reconstruida desde telemetría</span>`:i}
        </div>
        ${n.models.length?e`<p class="se-models" style="margin:0"><span class="se-mlbl">Modelos usados</span>${n.models.map(t=>e`<code class="ctx-chip">${t}</code>`)}</p>`:i}
      </header>
      <div class="se-filters">
        <button class="chip ${this.cats.size===0?`on`:``}" @click=${()=>{this.cats=new Set,this.load()}}>Todo · ${n.total}</button>
        ${l.filter(e=>n.byCategory[e.key]).map(t=>e`<button class="chip ${this.cats.has(t.key)?`on`:``}" @click=${()=>this.toggleCat(t.key)}>${t.icon} ${t.label} · ${n.byCategory[t.key]}</button>`)}
        <input class="search se-q" type="search" placeholder="Buscar en la sesión" .value=${this.q} @input=${e=>this.onSearch(e)} aria-label="buscar eventos de la sesión">
      </div>
      <div class="se-rail" role="list">${t.events.map(e=>this.row(e))}</div>
      ${t.total>t.events.length?e`<button class="btn sm sec" style="margin:.7rem 0" @click=${()=>void this.loadMore()}>cargar más · ${t.events.length}/${t.total}</button>`:i}
      ${t.total===0?e`<p class="muted" style="margin-top:.6rem">Sin eventos para este filtro.</p>`:i}
    `}row(t){return e`<div class="se-row cat-${t.category}" role="listitem" style="--d:${Math.min(t.depth,6)}">
      <span class="se-time">${this.clock(t.ts)}</span>
      <span class="se-ic" aria-hidden="true">${u[t.category]??`•`}</span>
      <span class="se-body">
        <span class="se-lbl">${t.label}</span>
        ${t.detail?e`<span class="se-det">${t.detail}</span>`:i}
      </span>
      ${t.durationMs==null?i:e`<span class="se-dur" title="duración">${this.dchip(t.durationMs)}</span>`}
    </div>`}};c([s()],d.prototype,`apiBase`,void 0),c([s()],d.prototype,`change`,void 0),c([s()],d.prototype,`projId`,void 0),c([r()],d.prototype,`data`,void 0),c([r()],d.prototype,`err`,void 0),c([r()],d.prototype,`cats`,void 0),c([r()],d.prototype,`q`,void 0),c([r()],d.prototype,`limit`,void 0),d=c([o(`session-screen`)],d);export{d as SessionScreen};
import{c as e,f as t,g as n,h as r,l as i,m as a,p as o,t as s,u as c,v as l}from"./index-DZrapA98.js";var u=[{key:`tool`,icon:s(`wrench`),label:`Tools`},{key:`hook`,icon:s(`shield`),label:`Hooks`},{key:`message`,icon:s(`chat`),label:`Mensajes`},{key:`permission`,icon:s(`key`),label:`Permisos`},{key:`subagent`,icon:s(`bot`),label:`Subagentes`},{key:`session`,icon:`◆`,label:`Sesión`},{key:`skill`,icon:`✦`,label:`Skills`}],d={...Object.fromEntries(u.map(e=>[e.key,e.icon])),other:`•`},f=class extends t{constructor(...t){super(...t),this.apiBase=`/api/`,this.change=``,this.projId=``,this.data=null,this.err=``,this.cats=new Set,this.q=``,this.limit=250,this.api=new e(`/api/`),this.activeBase=``,this.qTimer=null,this.seq=0}updated(t){this.apiBase&&this.apiBase!==this.activeBase&&(this.activeBase=this.apiBase,this.api=new e(this.apiBase),this.load())}disconnectedCallback(){super.disconnectedCallback(),this.qTimer&&=(clearTimeout(this.qTimer),null),this.seq++}async load(){let e=++this.seq;try{let t=await this.api.events({cat:[...this.cats],q:this.q,limit:this.limit});if(e!==this.seq)return;this.data=t,this.err=``}catch(t){if(e!==this.seq)return;this.err=t.message,this.data=null}}async loadMore(){if(!this.data)return;let e=++this.seq,t=this.data.events.length;try{let n=await this.api.events({cat:[...this.cats],q:this.q,limit:this.limit,offset:t});if(e!==this.seq||!this.data)return;this.data={...this.data,events:[...this.data.events,...n.events]}}catch{}}toggleCat(e){let t=new Set(this.cats);t.has(e)?t.delete(e):t.add(e),this.cats=t,this.load()}onSearch(e){this.q=e.target.value,this.qTimer&&clearTimeout(this.qTimer),this.qTimer=setTimeout(()=>void this.load(),250)}runPath(){return this.projId?`/run/${this.projId}/${this.change}`:`/run/${this.change}`}dur(e){if(!e)return`—`;let t=Math.round(e/1e3);return t<60?t+`s`:Math.floor(t/60)+`m `+t%60+`s`}clock(e){if(!e)return``;let t=new Date(e);return Number.isNaN(+t)?``:t.toISOString().slice(11,19)}dchip(e){return e>=1e3?(e/1e3).toFixed(1)+`s`:e+`ms`}render(){if(this.err)return l`<div class="apphdr"><h1 class="trunc">Sesión</h1></div>
        <p class="muted" style="margin-top:.6rem">${/404|sin traza|sin events|no hay/i.test(this.err)?`Este run no dejó traza de sesión (ni del CLI ni telemetría). Aún no ha producido pasos, o se lanzó con un runner que no la emite.`:`No se pudo cargar la traza de sesión de este run.`}</p>
        <p style="margin-top:.8rem"><a class="btn sm sec" href=${this.runPath()}>Volver al run</a></p>`;let e=this.data;if(!e)return i(`Cargando sesión`,!0);if(e.noTrace||!e.summary||e.summary.total===0)return l`<div class="apphdr"><h1 class="trunc">Sesión</h1></div>
        <p class="muted" style="margin-top:.6rem">Este run no dejó traza de sesión (ni del CLI ni telemetría). Aún no ha producido pasos, o se lanzó con un runner que no la emite.</p>
        <p style="margin-top:.8rem"><a class="btn sm sec" href=${this.runPath()}>Volver al run</a></p>`;let t=e.summary;return l`
      <header class="se-head">
        <span class="se-eyebrow">Sesión del agente</span>
        <div class="se-titlerow"><h1 class="trunc">${this.change}</h1><a class="btn sm sec" href=${this.runPath()}>Volver al run</a></div>
        <div class="se-stats">
          ${t.start?.branch?l`<span title="rama de git">⎇ ${t.start.branch}</span>`:n}
          <span title="duración total">${this.dur(t.durationMs)}</span>
          <span>${t.total} eventos</span>
          <span class="zero-tok">Visor local · 0 tokens</span>
          ${t.reconstructed?l`<span class="zero-tok" title="Reconstruida desde la telemetría OTel del run (los modelos LiteLLM no emiten la traza nativa del CLI)">Reconstruida desde telemetría</span>`:n}
        </div>
        ${t.models.length?l`<p class="se-models" style="margin:0"><span class="se-mlbl">Modelos usados</span>${[...t.models.reduce((e,t)=>e.set(t,(e.get(t)??0)+1),new Map)].map(([e,t])=>l`<code class="ctx-chip">${e}${t>1?` ×${t}`:``}</code>`)}</p>`:n}
        <p class="se-models" style="margin:0"><span class="se-mlbl">Papeles</span><span class="muted" style="font-size:.78rem">planner planifica (no toca código) · coder edita src/ (apply/fix) · reviewer verifica con lentes (sin escritura) — orquesta el driver determinista, no un LLM</span></p>
      </header>
      <div class="se-filters">
        <button class="chip ${this.cats.size===0?`on`:``}" @click=${()=>{this.cats=new Set,this.load()}}>Todo · ${t.total}</button>
        ${u.filter(e=>t.byCategory[e.key]).map(e=>l`<button class="chip ${this.cats.has(e.key)?`on`:``}" @click=${()=>this.toggleCat(e.key)}>${e.icon} ${e.label} · ${t.byCategory[e.key]}</button>`)}
        <input class="search se-q" type="search" placeholder="Buscar en la sesión" .value=${this.q} @input=${e=>this.onSearch(e)} aria-label="buscar eventos de la sesión">
      </div>
      <div class="se-rail" role="list">${e.events.map(e=>this.row(e))}</div>
      ${e.total>e.events.length?l`<button class="btn sm sec" style="margin:.7rem 0" @click=${()=>void this.loadMore()}>cargar más · ${e.events.length}/${e.total}</button>`:n}
      ${e.total===0?l`<p class="muted" style="margin-top:.6rem">Sin eventos para este filtro.</p>`:n}
    `}row(e){return l`<div class="se-row cat-${e.category}" role="listitem" style="--d:${Math.min(e.depth,6)}">
      <span class="se-time">${this.clock(e.ts)}</span>
      <span class="se-ic" aria-hidden="true">${d[e.category]??`•`}</span>
      <span class="se-body">
        <span class="se-lbl">${e.label}</span>
        ${e.detail?l`<span class="se-det">${e.detail}</span>`:n}
      </span>
      ${e.durationMs==null?n:l`<span class="se-dur" title="duración">${this.dchip(e.durationMs)}</span>`}
    </div>`}};c([a()],f.prototype,`apiBase`,void 0),c([a()],f.prototype,`change`,void 0),c([a()],f.prototype,`projId`,void 0),c([o()],f.prototype,`data`,void 0),c([o()],f.prototype,`err`,void 0),c([o()],f.prototype,`cats`,void 0),c([o()],f.prototype,`q`,void 0),c([o()],f.prototype,`limit`,void 0),f=c([r(`session-screen`)],f);export{f as SessionScreen};
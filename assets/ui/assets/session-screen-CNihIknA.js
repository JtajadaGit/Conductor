import{f as e,g as t,h as n,l as r,m as i,n as a,p as o,t as s,u as c,v as l}from"./index-B6cTFdfH.js";var u=[{key:`tool`,icon:a(`wrench`),label:`Tools`},{key:`hook`,icon:a(`shield`),label:`Hooks`},{key:`message`,icon:a(`chat`),label:`Mensajes`},{key:`permission`,icon:a(`key`),label:`Permisos`},{key:`subagent`,icon:a(`bot`),label:`Subagentes`},{key:`session`,icon:`◆`,label:`Sesión`},{key:`skill`,icon:`✦`,label:`Skills`}],d={...Object.fromEntries(u.map(e=>[e.key,e.icon])),other:`•`},f=class extends e{constructor(...e){super(...e),this.apiBase=`/api/`,this.change=``,this.projId=``,this.data=null,this.err=``,this.cats=new Set,this.q=``,this.limit=250,this.api=new r(`/api/`),this.activeBase=``,this.qTimer=null,this.seq=0}updated(e){this.apiBase&&this.apiBase!==this.activeBase&&(this.activeBase=this.apiBase,this.api=new r(this.apiBase),this.load())}disconnectedCallback(){super.disconnectedCallback(),this.qTimer&&=(clearTimeout(this.qTimer),null),this.seq++}async load(){let e=++this.seq;try{let t=await this.api.events({cat:[...this.cats],q:this.q,limit:this.limit});if(e!==this.seq)return;this.data=t,this.err=``}catch(t){if(e!==this.seq)return;this.err=t.message,this.data=null}}async loadMore(){if(!this.data)return;let e=++this.seq,t=this.data.events.length;try{let n=await this.api.events({cat:[...this.cats],q:this.q,limit:this.limit,offset:t});if(e!==this.seq||!this.data)return;this.data={...this.data,events:[...this.data.events,...n.events]}}catch{}}toggleCat(e){let t=new Set(this.cats);t.has(e)?t.delete(e):t.add(e),this.cats=t,this.load()}onSearch(e){this.q=e.target.value,this.qTimer&&clearTimeout(this.qTimer),this.qTimer=setTimeout(()=>void this.load(),250)}runPath(){return this.projId?`/run/${this.projId}/${this.change}`:`/run/${this.change}`}dur(e){if(!e)return`—`;let t=Math.round(e/1e3);return t<60?t+`s`:Math.floor(t/60)+`m `+t%60+`s`}clock(e){if(!e)return``;let t=new Date(e);return Number.isNaN(+t)?``:t.toISOString().slice(11,19)}dchip(e){return e>=1e3?(e/1e3).toFixed(1)+`s`:e+`ms`}render(){if(this.err)return l`<div class="apphdr"><h1 class="trunc">Sesión</h1></div>
        <p class="muted" style="margin-top:.6rem">${/404|sin traza|sin events|no hay/i.test(this.err)?`Este run no dejó traza de sesión (ni del CLI ni telemetría). Aún no ha producido pasos, o se lanzó con un runner que no la emite.`:`No se pudo cargar la traza de sesión de este run.`}</p>
        <p style="margin-top:.8rem"><a class="btn sm sec" href=${this.runPath()}>Volver al run</a></p>`;let e=this.data;if(!e)return c(`Cargando sesión`);if(e.noTrace||!e.summary||e.summary.total===0)return l`<div class="apphdr"><h1 class="trunc">Sesión</h1></div>
        <p class="muted" style="margin-top:.6rem">Este run no dejó traza de sesión (ni del CLI ni telemetría). Aún no ha producido pasos, o se lanzó con un runner que no la emite.</p>
        <p style="margin-top:.8rem"><a class="btn sm sec" href=${this.runPath()}>Volver al run</a></p>`;let n=e.summary;return l`
      <header class="se-head">
        <span class="se-eyebrow">Sesión del agente</span>
        <div class="se-titlerow"><h1 class="trunc">${this.change}</h1><a class="btn sm sec" href=${this.runPath()}>Volver al run</a></div>
        <div class="se-stats">
          ${n.start?.branch?l`<span title="rama de git">⎇ ${n.start.branch}</span>`:t}
          <span title="duración total">${this.dur(n.durationMs)}</span>
          <span>${n.total} eventos</span>
          <span class="zero-tok">Visor local · 0 tokens</span>
          ${n.reconstructed?l`<span class="zero-tok" title="Reconstruida desde la telemetría OTel del run (los modelos LiteLLM no emiten la traza nativa del CLI)">Reconstruida desde telemetría</span>`:t}
        </div>
        ${n.models.length?l`<p class="se-models" style="margin:0"><span class="se-mlbl">Modelos usados</span>${[...n.models.reduce((e,t)=>e.set(t,(e.get(t)??0)+1),new Map)].map(([e,t])=>l`<code class="ctx-chip">${e}${t>1?` ×${t}`:``}</code>`)}</p>`:t}
        <p class="se-models" style="margin:0"><span class="se-mlbl">Papeles</span><span class="muted" style="font-size:.78rem">planner planifica (no toca código) · coder edita src/ (apply/fix) · reviewer verifica con lentes (sin escritura) — orquesta el driver determinista, no un LLM</span></p>
      </header>
      <div class="se-filters">
        <button class="chip ${this.cats.size===0?`on`:``}" @click=${()=>{this.cats=new Set,this.load()}}>Todo · ${n.total}</button>
        ${u.filter(e=>n.byCategory[e.key]).map(e=>l`<button class="chip ${this.cats.has(e.key)?`on`:``}" @click=${()=>this.toggleCat(e.key)}>${e.icon} ${e.label} · ${n.byCategory[e.key]}</button>`)}
        <input class="search se-q" type="search" placeholder="Buscar en la sesión" .value=${this.q} @input=${e=>this.onSearch(e)} aria-label="buscar eventos de la sesión">
      </div>
      <div class="se-rail" role="list">${e.events.map(e=>this.row(e))}</div>
      ${e.total>e.events.length?l`<button class="btn sm sec" style="margin:.7rem 0" @click=${()=>void this.loadMore()}>cargar más · ${e.events.length}/${e.total}</button>`:t}
      ${e.total===0?l`<p class="muted" style="margin-top:.6rem">Sin eventos para este filtro.</p>`:t}
    `}row(e){return l`<div class="se-row cat-${e.category}" role="listitem" style="--d:${Math.min(e.depth,6)}">
      <span class="se-time">${this.clock(e.ts)}</span>
      <span class="se-ic" aria-hidden="true">${d[e.category]??`•`}</span>
      <span class="se-body">
        <span class="se-lbl">${e.label}</span>
        ${e.detail?l`<span class="se-det">${e.detail}</span>`:t}
      </span>
      ${e.durationMs==null?t:l`<span class="se-dur" title="duración">${this.dchip(e.durationMs)}</span>`}
    </div>`}};s([i()],f.prototype,`apiBase`,void 0),s([i()],f.prototype,`change`,void 0),s([i()],f.prototype,`projId`,void 0),s([o()],f.prototype,`data`,void 0),s([o()],f.prototype,`err`,void 0),s([o()],f.prototype,`cats`,void 0),s([o()],f.prototype,`q`,void 0),s([o()],f.prototype,`limit`,void 0),f=s([n(`session-screen`)],f);export{f as SessionScreen};
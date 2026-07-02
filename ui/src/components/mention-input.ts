import { html, nothing, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { live } from 'lit/directives/live.js';
import { CElement } from '../core/element';

/**
 * <mention-input> — textarea del prompt con la experiencia de Copilot: al escribir `@` autocompleta FICHEROS del
 * proyecto (para dar contexto — el driver pre-inyecta su contenido) y al escribir `/` autocompleta SKILLS del equipo.
 * Dropdown inline bajo el campo, navegación con ↑/↓ · Enter/Tab inserta · Esc cierra. Controlado: emite `cdr-input`
 * con el valor en cada cambio; usa el directivo live() para no resetear el caret en el re-render del padre.
 */
type Item = { v: string; label: string; sub?: string };

@customElement('mention-input')
export class MentionInput extends CElement {
  @property() value = '';
  @property() projId = '';
  @property() placeholder = '';
  @property({ type: Number }) rows = 3;
  @state() private open = false;
  @state() private items: Item[] = [];
  @state() private index = 0;
  private kind: '@' | '/' = '@';
  private query = '';
  private tokStart = 0;
  private timer = 0;
  private seq = 0;
  private pendingCaret: number | null = null;
  private skillsCache: { name: string; title?: string }[] | null = null;

  override disconnectedCallback(): void { super.disconnectedCallback(); clearTimeout(this.timer); }

  private emit(v: string): void { this.dispatchEvent(new CustomEvent('cdr-input', { detail: { value: v }, bubbles: true, composed: true })); }
  private close(): void { this.open = false; this.items = []; clearTimeout(this.timer); }

  private onInput(e: Event): void {
    const ta = e.target as HTMLTextAreaElement;
    this.emit(ta.value);
    // token de mención ACTIVO justo antes del caret, precedido de inicio/espacio. Kind-aware: tras @ (fichero) el
    // cuerpo ADMITE '/' (rutas tipo src/api/x.ts — sin esto, teclear @src/ cerraba el menú); tras / (skill) no.
    const before = ta.value.slice(0, ta.selectionStart);
    const m = before.match(/(^|\s)(?:@([^\s@]*)|\/([^\s@/]*))$/);
    if (!m) { this.close(); return; }
    const isFile = m[2] !== undefined;
    this.kind = isFile ? '@' : '/'; this.query = isFile ? m[2]! : m[3]!;
    this.tokStart = ta.selectionStart - this.query.length - 1;
    this.open = true; this.index = 0;
    clearTimeout(this.timer); this.timer = window.setTimeout(() => void this.fetchItems(), 130);
  }

  private async fetchItems(): Promise<void> {
    const seq = ++this.seq;
    try {
      const p = new URLSearchParams(); if (this.projId) p.set('project', this.projId);
      if (this.kind === '@') {
        p.set('q', this.query);
        const d = await (await fetch('/api/files?' + p)).json();
        if (seq !== this.seq) return;
        this.items = (d.files || []).slice(0, 30).map((f: string): Item => ({ v: f, label: f }));
      } else {
        if (!this.skillsCache) this.skillsCache = ((await (await fetch('/api/skills?' + p)).json()).skills || []);
        if (seq !== this.seq) return;
        const ql = this.query.toLowerCase();
        this.items = (this.skillsCache || []).filter((s) => !ql || s.name.toLowerCase().includes(ql)).slice(0, 20).map((s): Item => ({ v: s.name, label: s.name, sub: s.title }));
      }
      this.index = 0;
    } catch { this.items = []; }
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); if (this.items.length) this.index = (this.index + 1) % this.items.length; }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (this.items.length) this.index = (this.index - 1 + this.items.length) % this.items.length; }
    else if ((e.key === 'Enter' || e.key === 'Tab') && this.items.length) { e.preventDefault(); this.insert(this.items[this.index]!); }
    else if (e.key === 'Escape') { e.preventDefault(); this.close(); }
  }

  private insert(it: Item): void {
    const ta = this.querySelector('textarea') as HTMLTextAreaElement | null;
    if (!ta) return;
    const caret = ta.selectionStart;
    // #9: ruta con espacios → citar @"ruta con espacios" (la sintaxis que el driver sabe parsear); skills nunca llevan espacios.
    const body = this.kind === '@' && /\s/.test(it.v) ? '"' + it.v + '"' : it.v;
    const ins = this.kind + body;
    const val = ta.value.slice(0, this.tokStart) + ins + ' ' + ta.value.slice(caret);
    const pos = this.tokStart + ins.length + 1;
    // #11: sincroniza value con live() y fija el caret en updated() (tras el repintado por close()), en vez de
    // imperativo antes de cerrar → sin saltos de cursor al insertar en mitad del texto. Emite ANTES de cerrar.
    this.value = val;
    this.pendingCaret = pos;
    this.emit(val);
    this.close();
  }

  override updated(): void {
    if (this.pendingCaret == null) return;
    const ta = this.querySelector('textarea') as HTMLTextAreaElement | null;
    if (ta) { ta.focus(); ta.setSelectionRange(this.pendingCaret, this.pendingCaret); }
    this.pendingCaret = null;
  }

  override render(): TemplateResult {
    return html`
      <div class="mi-wrap">
        <textarea class="mi-ta" rows=${this.rows} placeholder=${this.placeholder} .value=${live(this.value)} required
          role="combobox" aria-autocomplete="list" aria-expanded=${this.open ? 'true' : 'false'}
          aria-controls="mi-menu" aria-activedescendant=${this.open && this.items.length ? 'mi-opt-' + this.index : nothing}
          @input=${(e: Event) => this.onInput(e)} @keydown=${(e: KeyboardEvent) => this.onKey(e)}
          @blur=${() => { this.timer = window.setTimeout(() => { this.open = false; }, 130); }}></textarea>
        ${this.open ? html`
          <ul id="mi-menu" class="mi-menu" role="listbox" aria-label=${this.kind === '@' ? 'ficheros' : 'skills'}>
            <li class="mi-head">${this.kind === '@' ? 'FICHERO PARA CONTEXTO' : 'SKILL DEL EQUIPO'}</li>
            ${this.items.length ? this.items.map((it, i) => html`
              <li id=${'mi-opt-' + i} role="option" aria-selected=${i === this.index ? 'true' : 'false'} class="mi-item ${i === this.index ? 'on' : ''}"
                @mousemove=${() => { this.index = i; }} @mousedown=${(e: Event) => { e.preventDefault(); this.insert(it); }}>
                <span class="mi-trig">${this.kind}</span><span class="mi-lbl">${it.label}</span>${it.sub ? html`<span class="mi-sub">${it.sub}</span>` : nothing}
              </li>`)
              : html`<li class="mi-empty">Sin resultados para "${this.query}"</li>`}
          </ul>` : nothing}
      </div>`;
  }
}

declare global { interface HTMLElementTagNameMap { 'mention-input': MentionInput; } }

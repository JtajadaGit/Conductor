// Poller del estado de un run. Ultra-agile: 2s activo / 5s en pausa, dedupe por hash IGNORANDO `now`
// (cambia cada poll) para no re-renderizar sin cambios reales; para al `done`; AbortController para cancelar.
// Respeta el contrato del motor (polling, NO SSE: el motor no expone event-stream).
import type { RunState } from './types';

export class RunPoller {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private abort: AbortController | null = null;
  private lastHash = '';
  private stopped = true;

  constructor(
    private base: string,
    private onState: (s: RunState) => void,
    private onError?: (e: unknown) => void,
  ) {}

  start(): void {
    this.stopped = false;
    this.lastHash = '';
    void this.tick();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer != null) { clearTimeout(this.timer); this.timer = null; }
    if (this.abort) { this.abort.abort(); this.abort = null; }
  }

  private schedule(ms: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.tick(), ms);
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    this.abort = new AbortController();
    try {
      const r = await fetch(this.base + 'state', { signal: this.abort.signal });
      const raw = await r.json();
      if (this.stopped) return;
      // L18: /state debe ser un OBJETO. Una respuesta no-objeto (null/string de error/array) rompía el
      // render del run (s.phases.map…). Se ignora y se reintenta, sin propagar un estado inválido.
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { this.schedule(3000); return; }
      const s = { ...raw, phases: Array.isArray(raw.phases) ? raw.phases : [] } as RunState;
      const h = this.hashOf(s);
      if (h !== this.lastHash) { this.lastHash = h; this.onState(s); }
      if (s.done) { this.stop(); return; }
      this.schedule(s.pending ? 5000 : 2000);
    } catch (e) {
      if (this.stopped) return;
      if ((e as { name?: string }).name !== 'AbortError') this.onError?.(e);
      this.schedule(3000);
    }
  }

  private hashOf(s: RunState): string {
    const { now: _now, ...rest } = s; // ignora el reloj del servidor
    void _now;
    return JSON.stringify(rest);
  }
}

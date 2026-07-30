// eval/live.mjs — RE-EXPORT de compatibilidad. El harness vive ahora en engine/lib/pipeline/evals.mjs
// (bundlable: engine/eval NO viaja en el tarball npm y el bundler no reescribe imports dinámicos).
// Aquí solo la fachada para que eval/run.mjs y los tests históricos sigan funcionando sin cambios.
export { makeLiveAgent, driveOnce, LIVE_SCENARIOS, runLive, GOLDEN_SCENARIOS, runGolden, promptsFingerprint, appendEvalResult, lastEvalResult } from '../lib/pipeline/evals.mjs';

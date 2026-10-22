// Cliente del worker de IA.
let worker;
let seq = 0;
const jobs = new Map();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { id, type, data, error } = e.data;
      const job = jobs.get(id);
      if (!job) return;
      if (type === 'progress') job.onProgress?.(data);
      else if (type === 'stage') job.onStage?.(data);
      else if (type === 'partial') job.onPartial?.(data);
      else if (type === 'result') { jobs.delete(id); job.resolve(data); }
      else if (type === 'error') { jobs.delete(id); job.reject(new Error(error)); }
    };
    worker.onerror = (e) => {
      for (const j of jobs.values()) j.reject(new Error(e.message || 'Error en el worker de IA'));
      jobs.clear();
      worker = null;
    };
  }
  return worker;
}

export function runAI(kind, payload, handlers = {}, transfer = []) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    jobs.set(id, { resolve, reject, ...handlers });
    getWorker().postMessage({ id, kind, payload }, transfer);
  });
}

// Agrega el progreso de descarga de varios archivos del modelo en un solo porcentaje.
export function downloadTracker(onPct) {
  const files = new Map();
  return (d) => {
    if (d.status === 'progress' && d.file) {
      files.set(d.file, { loaded: d.loaded || 0, total: d.total || 0 });
      let l = 0, t = 0;
      for (const f of files.values()) { l += f.loaded; t += f.total; }
      if (t) onPct(l / t, t);
    } else if (d.status === 'ready') onPct(1, 0);
  };
}

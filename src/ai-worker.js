// Worker de IA en el navegador (transformers.js): transcripción (Whisper) y texto a voz (MMS-TTS).
import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

const pipes = new Map();

function getPipe(task, model, id, opts = {}) {
  const key = `${task}|${model}`;
  if (!pipes.has(key)) {
    const p = pipeline(task, model, {
      ...opts,
      progress_callback: (d) => self.postMessage({ id, type: 'progress', data: d }),
    }).catch((e) => { pipes.delete(key); throw e; });
    pipes.set(key, p);
  }
  return pipes.get(key);
}

self.onmessage = async (e) => {
  const { id, kind, payload } = e.data;
  try {
    if (kind === 'asr') {
      const asr = await getPipe('automatic-speech-recognition', payload.model, id, { dtype: 'q8', device: 'wasm' });
      self.postMessage({ id, type: 'stage', data: 'transcribing' });
      const out = await asr(payload.audio, {
        return_timestamps: true,
        chunk_length_s: 30,
        stride_length_s: 5,
        ...(payload.language ? { language: payload.language, task: 'transcribe' } : {}),
      });
      self.postMessage({ id, type: 'result', data: { text: out.text, chunks: out.chunks || [] } });
    } else if (kind === 'tts') {
      const tts = await getPipe('text-to-speech', payload.model, id, { dtype: 'fp32', device: 'wasm' });
      self.postMessage({ id, type: 'stage', data: 'speaking' });
      if (payload.rate && tts.model?.config) tts.model.config.speaking_rate = payload.rate;
      const parts = payload.text.match(/[^.!?¡¿\n]+[.!?]*|\n/g)?.map((s) => s.trim()).filter(Boolean) || [payload.text];
      const outs = [];
      let sr = 16000;
      for (let i = 0; i < parts.length; i++) {
        const r = await tts(parts[i]);
        sr = r.sampling_rate;
        outs.push(r.audio);
        outs.push(new Float32Array(Math.round(sr * 0.25)));
        self.postMessage({ id, type: 'partial', data: (i + 1) / parts.length });
      }
      const len = outs.reduce((a, b) => a + b.length, 0);
      const audio = new Float32Array(len);
      let o = 0;
      for (const a of outs) { audio.set(a, o); o += a.length; }
      self.postMessage({ id, type: 'result', data: { audio, sampling_rate: sr } }, [audio.buffer]);
    }
  } catch (err) {
    self.postMessage({ id, type: 'error', error: String(err?.message || err) });
  }
};

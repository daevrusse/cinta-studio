// Panel "Voz en off": texto a voz con IA en el navegador y grabación con micrófono.
import { state } from '../state.js';
import { h, icon, btn, toast, progressBar, fmtTime } from '../ui.js';
import { section, select as sel, slider } from '../controls.js';
import { runAI, downloadTracker } from '../ai.js';
import { encodeWav } from '../audio.js';
import { importFile } from '../media.js';
import { addMediaToTimeline } from '../actions.js';
import { createRecorder, stopStream, levelMeter, extFor } from '../recorder.js';
import { pause, play } from '../player.js';

const VOICES = {
  'Xenova/mms-tts-spa': 'Español',
  'Xenova/mms-tts-eng': 'Inglés',
  'Xenova/mms-tts-por': 'Portugués',
  'Xenova/mms-tts-fra': 'Francés',
  'Xenova/mms-tts-deu': 'Alemán',
};
const opts = { voice: 'Xenova/mms-tts-spa', rate: 1 };

export function render(root) {
  // ---- texto a voz ----
  const ta = h('textarea', { rows: 6, placeholder: 'Escribe el guion de tu narración…', maxLength: 3000 });
  const counter = h('small', { class: 'muted' }, '0 / 3000');
  ta.addEventListener('input', () => { counter.textContent = `${ta.value.length} / 3000`; });
  const status = h('div', { class: 'ai-status hidden' });
  const statusText = h('span');
  const pb = progressBar();
  status.append(statusText, pb.el);
  const result = h('div', { class: 'tts-result' });
  let busy = false;
  const genBtn = btn('Generar voz', { icon: 'sparkles', cls: 'primary full', onClick: gen });

  async function gen() {
    const text = ta.value.trim();
    if (!text) { toast('Escribe un texto primero', 'info'); return; }
    if (busy) return;
    busy = true; genBtn.disabled = true;
    status.classList.remove('hidden');
    statusText.textContent = 'Descargando voz (solo la primera vez)…'; pb.set(0.02);
    try {
      const out = await runAI('tts', { text, model: opts.voice, rate: opts.rate }, {
        onProgress: downloadTracker((p) => pb.set(p * 0.5)),
        onStage: () => { statusText.textContent = 'Generando voz…'; pb.set(0.55); },
        onPartial: (p) => pb.set(0.55 + p * 0.45),
      });
      const blob = encodeWav([out.audio], out.sampling_rate);
      const name = `Voz · ${text.slice(0, 28)}${text.length > 28 ? '…' : ''}`;
      const m = await importFile(new File([blob], 'voz.wav', { type: 'audio/wav' }), { name, source: 'tts' });
      const audio = h('audio', { controls: true, src: m.url });
      result.replaceChildren(h('div', { class: 'tts-card' }, audio,
        btn('Añadir en el cabezal', { icon: 'plus', cls: 'primary sm', onClick: () => addMediaToTimeline(m) })));
      toast('Voz generada', 'success');
    } catch (e) {
      console.error(e);
      toast(`No se pudo generar la voz: ${e.message}`, 'error', 6000);
    } finally {
      busy = false; genBtn.disabled = false;
      setTimeout(() => status.classList.add('hidden'), 800);
    }
  }

  // ---- grabar micrófono ----
  const meter = h('div', { class: 'meter' }, h('i'));
  const timer = h('span', { class: 'rec-timer' }, '0:00.00');
  const recBtn = h('button', { type: 'button', class: 'rec-btn', title: 'Grabar' }, icon('mic', 22));
  const countEl = h('div', { class: 'countdown hidden' });
  let stream, recorder, stopMeter, t0, raf, recording = false;
  const syncPlay = h('input', { type: 'checkbox', checked: true });

  recBtn.addEventListener('click', async () => {
    if (recording) return stopRec();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch { toast('Permite el acceso al micrófono para grabar', 'error'); return; }
    stopMeter = levelMeter(stream, meter);
    for (const n of [3, 2, 1]) { countEl.textContent = n; countEl.classList.remove('hidden'); await new Promise((r) => setTimeout(r, 700)); }
    countEl.classList.add('hidden');
    recorder = createRecorder(stream, 'audio');
    recorder.start();
    recording = true;
    recBtn.classList.add('on');
    recBtn.replaceChildren(icon('stop', 22));
    const startAt = state.time;
    recBtn.dataset.at = startAt;
    if (syncPlay.checked) play();
    t0 = performance.now();
    const loop = () => { timer.textContent = fmtTime((performance.now() - t0) / 1000); raf = requestAnimationFrame(loop); };
    loop();
  });

  async function stopRec() {
    recording = false;
    cancelAnimationFrame(raf);
    recorder.stop();
    pause();
    const blob = await recorder.done;
    stopStream(stream); stopMeter?.();
    recBtn.classList.remove('on');
    recBtn.replaceChildren(icon('mic', 22));
    try {
      const m = await importFile(new File([blob], `voz.${extFor(blob.type)}`, { type: blob.type }), { name: `Grabación de voz ${new Date().toLocaleTimeString()}`, source: 'mic' });
      addMediaToTimeline(m, { at: parseFloat(recBtn.dataset.at) || 0 });
      toast('Grabación añadida a la línea de tiempo', 'success');
    } catch (e) { toast('No se pudo procesar la grabación', 'error'); console.error(e); }
  }

  root.append(
    section('Texto a voz (IA)',
      h('p', { class: 'hint' }, 'La voz se genera en tu navegador, sin costo y sin enviar tu texto a servidores.'),
      sel('Voz', VOICES, opts.voice, (v) => { opts.voice = v; }),
      slider('Velocidad', { min: 0.6, max: 1.6, step: 0.05, value: opts.rate, unit: '×', onInput: (v) => { opts.rate = v; } }),
      ta, h('div', { class: 'row between' }, counter), genBtn, status, result),
    section('Grabar con micrófono',
      h('div', { class: 'rec-wrap' }, recBtn, h('div', { class: 'rec-side' }, timer, meter), countEl),
      h('label', { class: 'ctl ctl-toggle' }, h('span', null, 'Reproducir el video mientras grabo'), h('span', { class: 'switch' }, syncPlay, h('i'))),
      h('p', { class: 'hint' }, 'La grabación se coloca donde está el cabezal. Usa audífonos para evitar eco.')));
}

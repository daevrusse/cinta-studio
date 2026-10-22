// Panel "Subtítulos": generación automática con Whisper (en el navegador), edición, estilo y SRT.
import { state, on, checkpoint, changed, select, projectDuration, defaultSubtitle, placeItem, newTrack, insertTrack, removeItem } from '../state.js';
import { h, icon, btn, iconBtn, fmtTime, parseTime, toast, progressBar, downloadBlob } from '../ui.js';
import { section, slider, color, select as sel, toggle, commit } from '../controls.js';
import { FONTS } from '../constants.js';
import { mixAudio, toMono } from '../audio.js';
import { runAI, downloadTracker } from '../ai.js';
import { seek } from '../player.js';

const MODELS = {
  'onnx-community/whisper-tiny': 'Rápido (≈40 MB)',
  'onnx-community/whisper-base': 'Equilibrado (≈80 MB)',
  'onnx-community/whisper-small': 'Preciso (≈250 MB)',
};
const LANGS = { spanish: 'Español', english: 'Inglés', portuguese: 'Portugués', french: 'Francés', italian: 'Italiano', german: 'Alemán', '': 'Detectar automáticamente' };

const opts = { model: 'onnx-community/whisper-base', language: 'spanish', maxWords: 7, replace: true };

function subTrack() { return state.project.tracks.find((t) => t.kind === 'subtitle'); }
function subs() { return (subTrack()?.items || []).slice().sort((a, b) => a.start - b.start); }

export function render(root) {
  const status = h('div', { class: 'ai-status hidden' });
  const pb = progressBar();
  const statusText = h('span', null, '');
  status.append(statusText, pb.el);
  let running = false;

  const genBtn = btn('Generar subtítulos automáticamente', { icon: 'sparkles', cls: 'primary full', onClick: generate });

  async function generate() {
    if (running) return;
    const dur = projectDuration();
    if (dur <= 0) { toast('Primero añade un video o audio con voz a la línea de tiempo', 'info'); return; }
    running = true;
    genBtn.disabled = true;
    status.classList.remove('hidden');
    try {
      statusText.textContent = 'Preparando el audio…'; pb.set(0.02);
      const buf = await mixAudio(state.project, 16000, dur, 1);
      if (!buf) throw new Error('El proyecto no tiene audio audible.');
      const audio = toMono(buf);
      statusText.textContent = 'Descargando modelo de IA (solo la primera vez)…';
      const track = downloadTracker((p) => { pb.set(0.05 + p * 0.45); });
      const result = await runAI('asr', { audio, model: opts.model, language: opts.language || null }, {
        onProgress: track,
        onStage: () => { statusText.textContent = 'Transcribiendo… esto puede tardar un poco'; pb.set(0.6); },
      }, [audio.buffer]);
      pb.set(1);
      const pieces = buildPieces(result.chunks, dur, opts.maxWords);
      if (!pieces.length) throw new Error('No se detectó voz en el audio.');
      checkpoint();
      if (opts.replace) for (const s of subs()) removeItem(s.id);
      for (const p of pieces) placeItem(defaultSubtitle(p.text, p.start, p.end - p.start), {});
      changed();
      toast(`${pieces.length} subtítulos generados`, 'success');
    } catch (e) {
      console.error(e);
      toast(`No se pudieron generar: ${e.message}`, 'error', 6000);
    } finally {
      running = false;
      genBtn.disabled = false;
      setTimeout(() => status.classList.add('hidden'), 1200);
    }
  }

  const list = h('div', { class: 'sub-list' });
  const fileIn = h('input', { type: 'file', accept: '.srt,.vtt,text/vtt', hidden: true });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files[0];
    fileIn.value = '';
    if (!f) return;
    const cues = parseSrt(await f.text());
    if (!cues.length) { toast('No se encontraron subtítulos en el archivo', 'error'); return; }
    checkpoint();
    for (const c of cues) placeItem(defaultSubtitle(c.text, c.start, Math.max(0.2, c.end - c.start)), {});
    changed();
    toast(`${cues.length} subtítulos importados`, 'success');
  });

  const st = state.project.subtitleStyle;
  const styleBox = h('div');
  const drawStyle = () => {
    const s = state.project.subtitleStyle;
    styleBox.replaceChildren(
      sel('Fuente', Object.fromEntries(FONTS.map((f) => [f, f])), s.font, (v) => { s.font = v; document.fonts?.load(`700 40px "${v}"`); }),
      slider('Tamaño', { min: 20, max: 200, value: s.size, unit: 'px', onInput: (v) => { s.size = v; } }),
      color('Color del texto', s.color, (v) => { s.color = v; }),
      color('Color de fondo', s.bgColor, (v) => { s.bgColor = v; }),
      slider('Opacidad del fondo', { min: 0, max: 100, value: Math.round(s.bgOpacity * 100), unit: '%', onInput: (v) => { s.bgOpacity = v / 100; } }),
      slider('Contorno', { min: 0, max: 16, value: s.strokeWidth, unit: 'px', onInput: (v) => { s.strokeWidth = v; } }),
      slider('Posición vertical', { min: 5, max: 95, value: Math.round(s.position * 100), unit: '%', onInput: (v) => { s.position = v / 100; } }),
      slider('Ancho máximo', { min: 30, max: 100, value: Math.round(s.maxWidth * 100), unit: '%', onInput: (v) => { s.maxWidth = v / 100; } }),
      toggle('Negrita', s.bold, (v) => { s.bold = v; }),
      toggle('MAYÚSCULAS', s.uppercase, (v) => { s.uppercase = v; }));
  };
  void st;
  drawStyle();

  const presets = h('div', { class: 'chips small' }, [
    ['Clásico', { font: 'Montserrat', color: '#FFFFFF', bgColor: '#000000', bgOpacity: 0.55, strokeWidth: 0, uppercase: false, bold: true }],
    ['Contorno', { font: 'Montserrat', color: '#FFFFFF', bgOpacity: 0, strokeWidth: 6, stroke: '#000000', uppercase: false, bold: true }],
    ['Reels', { font: 'Anton', color: '#FFE14D', bgOpacity: 0, strokeWidth: 7, stroke: '#000000', uppercase: true, bold: false, position: 0.62 }],
    ['Caja', { font: 'Manrope', color: '#111111', bgColor: '#FFFFFF', bgOpacity: 1, strokeWidth: 0, uppercase: false, bold: true }],
    ['Cine', { font: 'Inter', color: '#F1E4C3', bgOpacity: 0, strokeWidth: 0, uppercase: false, bold: false, position: 0.9 }],
  ].map(([n, p]) => h('button', { type: 'button', class: 'chip', onclick: () => commit(() => { Object.assign(state.project.subtitleStyle, p); drawStyle(); }) }, n)));

  root.append(
    section('Generar con IA',
      h('p', { class: 'hint' }, 'Transcribe la voz de tu línea de tiempo directamente en tu navegador. Tus archivos no se suben a ningún servidor.'),
      sel('Calidad', MODELS, opts.model, (v) => { opts.model = v; }),
      sel('Idioma del audio', LANGS, opts.language, (v) => { opts.language = v; }),
      slider('Palabras por subtítulo', { min: 2, max: 16, value: opts.maxWords, onInput: (v) => { opts.maxWords = v; } }),
      toggle('Reemplazar subtítulos existentes', opts.replace, (v) => { opts.replace = v; }),
      genBtn, status),
    section('Subtítulos',
      h('div', { class: 'btn-row' },
        btn('Añadir', { icon: 'plus', cls: 'ghost sm', onClick: addManual }),
        btn('Importar SRT', { icon: 'upload', cls: 'ghost sm', onClick: () => fileIn.click() }),
        btn('Exportar SRT', { icon: 'download', cls: 'ghost sm', onClick: exportSrt }),
        iconBtn('trash', 'Borrar todos', () => { const all = subs(); if (!all.length) return; checkpoint(); all.forEach((s) => removeItem(s.id)); changed(); }, 'danger')),
      fileIn, list),
    section('Estilo', presets, styleBox));

  function drawList() {
    list.replaceChildren();
    const all = subs();
    if (!all.length) { list.append(h('p', { class: 'muted small center' }, 'Aún no hay subtítulos.')); return; }
    for (const s of all) {
      const ta = h('textarea', { rows: 2, value: s.text });
      ta.addEventListener('focus', () => { select(s.id); seek(s.start + 0.01); });
      ta.addEventListener('change', () => commit(() => { s.text = ta.value; }));
      const tIn = h('input', { class: 'time-in', value: fmtTime(s.start) });
      const tOut = h('input', { class: 'time-in', value: fmtTime(s.start + s.duration) });
      const upd = () => {
        const a = parseTime(tIn.value), b = parseTime(tOut.value);
        if (isNaN(a) || isNaN(b) || b <= a) { tIn.value = fmtTime(s.start); tOut.value = fmtTime(s.start + s.duration); return; }
        commit(() => { s.start = a; s.duration = b - a; });
      };
      tIn.addEventListener('change', upd); tOut.addEventListener('change', upd);
      list.append(h('div', { class: `sub-row${state.selection === s.id ? ' on' : ''}`, dataset: { id: s.id } },
        h('div', { class: 'sub-times' }, tIn, h('span', null, '→'), tOut,
          iconBtn('trash', 'Eliminar', () => commit(() => removeItem(s.id)), 'mini')),
        ta));
    }
  }

  on((what, info) => {
    if (what === 'project' && !info?.live && info?.source !== 'props') drawList();
    if (what === 'history') drawStyle();
    if (what === 'select') list.querySelectorAll('.sub-row').forEach((r) => r.classList.toggle('on', r.dataset.id === state.selection));
  });
  drawList();
}

function addManual() {
  checkpoint();
  let tr = state.project.tracks.find((t) => t.kind === 'subtitle');
  if (!tr) tr = insertTrack(newTrack('subtitle'));
  const it = defaultSubtitle('Nuevo subtítulo', state.time, 2);
  placeItem(it, { trackId: tr.id });
  changed();
  select(it.id);
}

function buildPieces(chunks, dur, maxWords) {
  const out = [];
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const text = (c.text || '').trim();
    if (!text || /^\[.*\]$/.test(text) || /^\(.*\)$/.test(text)) continue;
    let [s, e] = c.timestamp || [0, null];
    if (s == null) continue;
    if (e == null || e <= s) e = chunks[i + 1]?.timestamp?.[0] ?? Math.min(dur, s + 3);
    e = Math.min(e, dur);
    const words = text.split(/\s+/);
    const n = Math.max(1, Math.ceil(words.length / maxWords));
    const per = Math.ceil(words.length / n);
    const groups = [];
    for (let k = 0; k < words.length; k += per) groups.push(words.slice(k, k + per).join(' '));
    const totalChars = groups.reduce((a, g) => a + g.length, 0) || 1;
    let t = s;
    for (const g of groups) {
      const d = ((e - s) * g.length) / totalChars;
      out.push({ text: g, start: t, end: Math.max(t + 0.3, t + d) });
      t += d;
    }
  }
  for (let i = 0; i < out.length - 1; i++) if (out[i].end > out[i + 1].start) out[i].end = out[i + 1].start;
  return out.filter((p) => p.end - p.start > 0.05);
}

function parseSrt(txt) {
  const cues = [];
  const blocks = txt.replace(/\r/g, '').replace(/^WEBVTT.*\n/, '').split(/\n\s*\n/);
  const tc = /(\d{1,2}:)?(\d{1,2}):(\d{2})[.,](\d{1,3})\s*-->\s*(\d{1,2}:)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;
  for (const b of blocks) {
    const lines = b.trim().split('\n');
    const i = lines.findIndex((l) => tc.test(l));
    if (i < 0) continue;
    const m = lines[i].match(tc);
    const t = (hh, mm, ss, ms) => (parseInt(hh || '0', 10) * 3600) + parseInt(mm, 10) * 60 + parseInt(ss, 10) + parseInt(ms.padEnd(3, '0'), 10) / 1000;
    const start = t(m[1]?.replace(':', ''), m[2], m[3], m[4]);
    const end = t(m[5]?.replace(':', ''), m[6], m[7], m[8]);
    const text = lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').trim();
    if (text) cues.push({ start, end, text });
  }
  return cues;
}

function exportSrt() {
  const all = subs();
  if (!all.length) { toast('No hay subtítulos para exportar', 'info'); return; }
  const f = (s) => {
    const ms = Math.round(s * 1000);
    const hh = Math.floor(ms / 3600000), mm = Math.floor((ms % 3600000) / 60000), ss = Math.floor((ms % 60000) / 1000), mmm = ms % 1000;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')},${String(mmm).padStart(3, '0')}`;
  };
  const txt = all.map((s, i) => `${i + 1}\n${f(s.start)} --> ${f(s.start + s.duration)}\n${s.text}\n`).join('\n');
  downloadBlob(new Blob([txt], { type: 'text/plain;charset=utf-8' }), `${state.project.name || 'subtitulos'}.srt`);
}

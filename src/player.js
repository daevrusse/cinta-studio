// Reproducción: reloj, sincronización de elementos <video>/<audio> y render de la vista previa.
import { state, on, emit, projectDuration, setTime } from './state.js';
import { drawFrame } from './renderer.js';

const els = new Map(); // itemId -> { el, mediaId, gain, node }
const images = new Map(); // mediaId -> HTMLImageElement
let actx = null;
let masterGain = null;
let canvas = null, ctx = null;
let rafPending = false;
let loopId = 0;
let clockStart = 0, timeStart = 0;

export function attachCanvas(c) {
  canvas = c;
  ctx = c.getContext('2d', { alpha: false });
}

function audioCtx() {
  if (!actx) {
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = actx.createGain();
      masterGain.connect(actx.destination);
    } catch { actx = null; }
  }
  if (actx?.state === 'suspended') actx.resume().catch(() => {});
  return actx;
}

function getEl(item) {
  let rec = els.get(item.id);
  const media = state.media.get(item.mediaId);
  if (!media) return null;
  if (rec && rec.mediaId !== item.mediaId) { disposeEl(item.id); rec = null; }
  if (!rec) {
    const el = document.createElement(item.type === 'audio' ? 'audio' : 'video');
    el.src = media.url;
    el.preload = 'auto';
    el.playsInline = true;
    el.crossOrigin = 'anonymous';
    if ('preservesPitch' in el) el.preservesPitch = true;
    el.addEventListener('seeked', requestRender);
    el.addEventListener('loadeddata', requestRender);
    rec = { el, mediaId: item.mediaId, gain: null, node: null };
    const ac = audioCtx();
    if (ac) {
      try {
        rec.node = ac.createMediaElementSource(el);
        rec.gain = ac.createGain();
        rec.node.connect(rec.gain).connect(masterGain);
      } catch { /* sin WebAudio: se usa el volumen del elemento */ }
    }
    els.set(item.id, rec);
  }
  return rec;
}

function disposeEl(id) {
  const rec = els.get(id);
  if (!rec) return;
  rec.el.pause();
  rec.el.removeAttribute('src');
  rec.el.load();
  try { rec.node?.disconnect(); rec.gain?.disconnect(); } catch {}
  els.delete(id);
}

export function getImage(mediaId) {
  let img = images.get(mediaId);
  const m = state.media.get(mediaId);
  if (!m) return null;
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.onload = requestRender;
    img.src = m.url;
    images.set(mediaId, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

export const previewSources = {
  video: (item) => {
    const rec = els.get(item.id) || getEl(item);
    const v = rec?.el;
    return v && v.videoWidth ? v : null;
  },
  image: (mediaId) => getImage(mediaId),
};

function gainFor(item, t) {
  const local = t - item.start;
  let g = item.muted ? 0 : item.volume ?? 1;
  const fi = Math.min(item.fadeIn || 0, item.duration / 2);
  const fo = Math.min(item.fadeOut || 0, item.duration / 2);
  if (fi > 0 && local < fi) g *= Math.max(0, local / fi);
  if (fo > 0 && local > item.duration - fo) g *= Math.max(0, (item.duration - local) / fo);
  return g;
}

function syncMedia(t, playing) {
  const p = state.project;
  const alive = new Set();
  for (const tr of p.tracks) {
    for (const it of tr.items) {
      if (it.type !== 'video' && it.type !== 'audio') continue;
      alive.add(it.id);
      const active = t >= it.start && t < it.start + it.duration && !(tr.hidden && it.type === 'video' && false);
      const near = t >= it.start - 1.5 && t < it.start + it.duration;
      if (!active && !near && !els.has(it.id)) continue;
      const rec = getEl(it);
      if (!rec) continue;
      const el = rec.el;
      const speed = it.speed || 1;
      const srcT = Math.max(0, (it.trimStart || 0) + (t - it.start) * speed);
      const silent = tr.muted || (tr.hidden && tr.kind === 'visual');
      const g = silent ? 0 : gainFor(it, t) * (p.masterVolume ?? 1);
      if (rec.gain) { rec.gain.gain.value = g; el.volume = 1; el.muted = false; }
      else { el.volume = Math.max(0, Math.min(1, g)); el.muted = g === 0; }
      if (el.playbackRate !== speed) el.playbackRate = speed;
      if (active) {
        if (playing) {
          if (el.paused) {
            if (Math.abs(el.currentTime - srcT) > 0.05) el.currentTime = srcT;
            el.play().catch(() => {});
          } else if (Math.abs(el.currentTime - srcT) > 0.3) el.currentTime = srcT;
        } else {
          if (!el.paused) el.pause();
          if (Math.abs(el.currentTime - srcT) > 0.02) el.currentTime = srcT;
        }
      } else {
        if (!el.paused) el.pause();
        if (near && t < it.start) {
          const pre = it.trimStart || 0;
          if (Math.abs(el.currentTime - pre) > 0.05) el.currentTime = pre; // pre-carga del primer fotograma
        }
      }
    }
  }
  for (const id of [...els.keys()]) if (!alive.has(id)) disposeEl(id);
}

export function render() {
  if (!canvas || !state.project) return;
  const scale = canvas.width / state.project.width;
  drawFrame(ctx, state.project, state.time, previewSources, scale);
  emit('rendered');
}

export function requestRender() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    if (!state.playing) syncMedia(state.time, false);
    render();
  });
}

function tick() {
  if (!state.playing) return;
  const t = timeStart + (performance.now() - clockStart) / 1000;
  const d = projectDuration();
  if (t >= d) {
    pause();
    setTime(d);
    return;
  }
  state.time = t;
  syncMedia(t, true);
  render();
  emit('time', { playing: true });
  loopId = requestAnimationFrame(tick);
}

export function play() {
  const d = projectDuration();
  if (d <= 0) return;
  audioCtx();
  if (state.time >= d - 0.02) state.time = 0;
  state.playing = true;
  clockStart = performance.now();
  timeStart = state.time;
  emit('playing');
  cancelAnimationFrame(loopId);
  loopId = requestAnimationFrame(tick);
}

export function pause() {
  if (!state.playing) return;
  state.playing = false;
  cancelAnimationFrame(loopId);
  for (const { el } of els.values()) el.pause();
  emit('playing');
  requestRender();
}

export function togglePlay() { state.playing ? pause() : play(); }

export function seek(t) {
  const wasPlaying = state.playing;
  if (wasPlaying) {
    setTime(t);
    clockStart = performance.now();
    timeStart = state.time;
    syncMedia(state.time, true);
  } else {
    setTime(t);
  }
}

export function invalidateMedia(mediaId) {
  images.delete(mediaId);
  for (const [id, rec] of els) if (rec.mediaId === mediaId) disposeEl(id);
}

on((what) => {
  if (what === 'project' || what === 'time' || what === 'media' || what === 'select') {
    if (what === 'time' && state.playing) return;
    requestRender();
  }
});

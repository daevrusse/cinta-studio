// Línea de tiempo multipista: regla, pistas, clips, recorte, arrastre, imán y zoom.
import {
  state, on, emit, select, checkpoint, changed, findItem, projectDuration, trackKindFor,
  makeMediaItem, placeItem, newTrack, insertTrack, trackOverlaps, mediaMaxDuration,
} from './state.js';
import { h, icon, iconBtn, fmtTime, clamp, toast } from './ui.js';
import { togglePlay, seek } from './player.js';
import { splitAtPlayhead, deleteSelected, duplicateSelected, detachAudio, copySelected } from './actions.js';
import { importFiles } from './media.js';

const HEAD = 132;
const ROW_H = { visual: 60, audio: 48, subtitle: 38 };
let root, scroller, content, rowsEl, rulerCanvas, playheadEl, timeLabel, playBtn, zoomInput, magnetBtn, dropNew;
let dragging = false;

const ZMIN = 4, ZMAX = 480;
const zoomToSlider = (z) => Math.round((Math.log(z / ZMIN) / Math.log(ZMAX / ZMIN)) * 1000);
const sliderToZoom = (v) => ZMIN * Math.pow(ZMAX / ZMIN, v / 1000);

export function mountTimeline(host) {
  playBtn = iconBtn('play', 'Reproducir (Espacio)', () => togglePlay(), 'play-btn');
  timeLabel = h('div', { class: 'tl-time' });
  zoomInput = h('input', { type: 'range', min: 0, max: 1000, value: zoomToSlider(state.zoom), class: 'zoom-range', 'aria-label': 'Zoom de la línea de tiempo', oninput: (e) => setZoom(sliderToZoom(+e.target.value)) });
  magnetBtn = iconBtn('magnet', 'Imán: ajustar a bordes y cabezal', () => { state.magnet = !state.magnet; magnetBtn.classList.toggle('on', state.magnet); });
  magnetBtn.classList.toggle('on', state.magnet);

  const toolbar = h('div', { class: 'tl-toolbar' },
    h('div', { class: 'tl-group' },
      iconBtn('skipBack', 'Ir al inicio (Inicio)', () => seek(0)),
      playBtn,
      iconBtn('skipFwd', 'Ir al final (Fin)', () => seek(projectDuration())),
      timeLabel),
    h('div', { class: 'tl-group' },
      iconBtn('scissors', 'Dividir en el cabezal (S)', splitAtPlayhead),
      iconBtn('copy', 'Duplicar (Ctrl+D)', duplicateSelected),
      iconBtn('trash', 'Eliminar (Supr)', deleteSelected),
      h('span', { class: 'tl-sep' }),
      magnetBtn),
    h('div', { class: 'tl-group tl-zoom' },
      iconBtn('zoomOut', 'Alejar', () => setZoom(state.zoom / 1.4)),
      zoomInput,
      iconBtn('zoomIn', 'Acercar', () => setZoom(state.zoom * 1.4)),
      iconBtn('fit', 'Ajustar a la ventana', fitZoom)));

  rulerCanvas = h('canvas', { class: 'tl-ruler' });
  const rulerRow = h('div', { class: 'tl-ruler-row' }, h('div', { class: 'tl-corner' }, h('span', null, 'Pistas')), rulerCanvas);
  rowsEl = h('div', { class: 'tl-rows' });
  dropNew = h('div', { class: 'tl-drop-new' }, icon('plus', 14), h('span', null, 'Suelta aquí para crear una pista nueva'));
  playheadEl = h('div', { class: 'tl-playhead' }, h('div', { class: 'tl-playhead-cap' }));
  content = h('div', { class: 'tl-content' }, rulerRow, rowsEl, dropNew, playheadEl);
  scroller = h('div', { class: 'tl-scroll' }, content);
  root = h('div', { class: 'timeline' }, toolbar, scroller);
  host.append(root);

  scroller.addEventListener('scroll', drawRuler, { passive: true });
  scroller.addEventListener('wheel', onWheel, { passive: false });
  new ResizeObserver(() => { sizeContent(); drawRuler(); }).observe(scroller);
  rulerCanvas.addEventListener('pointerdown', scrubStart);
  playheadEl.querySelector('.tl-playhead-cap').addEventListener('pointerdown', scrubStart);
  rowsEl.addEventListener('pointerdown', onRowsPointerDown);
  rowsEl.addEventListener('contextmenu', onContext);
  setupDrop(rowsEl);
  setupDrop(dropNew, true);

  on((what, info) => {
    if (what === 'project') {
      if (info?.source === 'timeline' && dragging) return;
      renderRows();
    } else if (what === 'media') renderRows();
    else if (what === 'select') markSelection();
    else if (what === 'time') { updatePlayhead(); if (state.playing) autoScroll(); }
    else if (what === 'playing') {
      playBtn.replaceChildren(icon(state.playing ? 'pause' : 'play', 18));
      playBtn.title = state.playing ? 'Pausar (Espacio)' : 'Reproducir (Espacio)';
    }
  });
  renderRows();
}

export function setZoom(z, anchorClientX) {
  const old = state.zoom;
  z = clamp(z, ZMIN, ZMAX);
  if (Math.abs(z - old) < 1e-6) return;
  const r = scroller.getBoundingClientRect();
  const ax = anchorClientX != null ? anchorClientX - r.left - HEAD : HEAD + state.time * old - scroller.scrollLeft - HEAD;
  const tAnchor = (scroller.scrollLeft + ax) / old;
  state.zoom = z;
  zoomInput.value = zoomToSlider(z);
  renderRows();
  scroller.scrollLeft = Math.max(0, tAnchor * z - ax);
  drawRuler();
}

function fitZoom() {
  const d = Math.max(projectDuration(), 5);
  const w = scroller.clientWidth - HEAD - 48;
  setZoom(w / d);
  scroller.scrollLeft = 0;
}

function onWheel(e) {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    setZoom(state.zoom * Math.pow(1.0018, -e.deltaY), e.clientX);
  } else if (e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
    e.preventDefault();
    scroller.scrollLeft += e.deltaY;
  }
}

function sizeContent() {
  const d = projectDuration();
  const vis = scroller.clientWidth - HEAD;
  const w = Math.max(vis, (d + 15) * state.zoom);
  content.style.width = `${HEAD + w}px`;
}

const xOf = (t) => HEAD + t * state.zoom;
const tAtClient = (clientX) => {
  const r = scroller.getBoundingClientRect();
  return Math.max(0, (clientX - r.left - HEAD + scroller.scrollLeft) / state.zoom);
};

// ---------- regla ----------
function drawRuler() {
  if (!rulerCanvas) return;
  const w = Math.max(10, scroller.clientWidth - HEAD);
  const hgt = 26;
  const dpr = window.devicePixelRatio || 1;
  if (rulerCanvas.width !== Math.round(w * dpr)) {
    rulerCanvas.width = Math.round(w * dpr); rulerCanvas.height = hgt * dpr;
    rulerCanvas.style.width = `${w}px`; rulerCanvas.style.height = `${hgt}px`;
  }
  const c = rulerCanvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, hgt);
  const z = state.zoom;
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  const major = steps.find((s) => s * z >= 70) || 600;
  const minor = major / (major >= 1 ? (major % 5 === 0 ? 5 : major === 2 ? 4 : 2) : 5);
  const t0 = scroller.scrollLeft / z;
  const t1 = t0 + w / z;
  const css = getComputedStyle(document.documentElement);
  c.strokeStyle = css.getPropertyValue('--tl-tick').trim() || '#444';
  c.fillStyle = css.getPropertyValue('--muted').trim() || '#888';
  c.font = '500 10.5px Manrope, sans-serif';
  c.textBaseline = 'top';
  c.beginPath();
  for (let t = Math.floor(t0 / minor) * minor; t <= t1 + minor; t += minor) {
    const x = Math.round((t - t0) * z) + 0.5;
    const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
    c.moveTo(x, isMajor ? 14 : 20); c.lineTo(x, hgt);
    if (isMajor) c.fillText(major < 1 ? fmtTime(t) : fmtTime(t, false), x + 4, 4);
  }
  c.stroke();
  const d = projectDuration();
  if (d > 0) {
    const x = (d - t0) * z;
    c.fillStyle = 'rgba(255,95,58,0.18)';
    c.fillRect(Math.max(0, x), hgt - 3, w, 3);
  }
}

function scrubStart(e) {
  e.preventDefault();
  e.stopPropagation();
  const move = (ev) => seek(tAtClient(ev.clientX));
  move(e);
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function updatePlayhead() {
  if (!playheadEl) return;
  playheadEl.style.transform = `translateX(${xOf(state.time)}px)`;
  timeLabel.replaceChildren(h('b', null, fmtTime(state.time)), h('span', null, ` / ${fmtTime(projectDuration())}`));
}

function autoScroll() {
  const x = xOf(state.time) - HEAD;
  const vis = scroller.clientWidth - HEAD;
  if (x > scroller.scrollLeft + vis - 40 || x < scroller.scrollLeft) scroller.scrollLeft = Math.max(0, x - 60);
}

// ---------- pistas y clips ----------
const KIND_ICON = { visual: 'layers', audio: 'music', subtitle: 'captions' };

function trackHeader(tr, index) {
  const label = tr.kind === 'audio' ? 'Audio' : tr.kind === 'subtitle' ? 'Subtítulos' : `Capa ${index}`;
  const btns = [];
  if (tr.kind !== 'audio') {
    btns.push(iconBtn(tr.hidden ? 'eyeOff' : 'eye', tr.hidden ? 'Mostrar pista' : 'Ocultar pista', (e) => {
      e.stopPropagation(); checkpoint(); tr.hidden = !tr.hidden; changed();
    }, tr.hidden ? 'off' : ''));
  }
  if (tr.kind === 'audio' || tr.items.some((i) => i.type === 'video')) {
    btns.push(iconBtn(tr.muted ? 'volumeX' : 'volume', tr.muted ? 'Activar sonido' : 'Silenciar pista', (e) => {
      e.stopPropagation(); checkpoint(); tr.muted = !tr.muted; changed();
    }, tr.muted ? 'off' : ''));
  }
  return h('div', { class: 'tl-head' }, icon(KIND_ICON[tr.kind], 14), h('span', { class: 'tl-head-name' }, label), h('div', { class: 'tl-head-btns' }, btns));
}

function clipEl(it, tr) {
  const m = it.mediaId ? state.media.get(it.mediaId) : null;
  const left = it.start * state.zoom;
  const width = Math.max(4, it.duration * state.zoom);
  const typeLabel = { video: 'film', image: 'image', audio: 'music', text: 'type', shape: 'shapes', subtitle: 'captions' }[it.type];
  const name = it.type === 'text' || it.type === 'subtitle' ? (it.text || '').replace(/\n/g, ' ') : it.name || m?.name || it.shape || it.type;
  const el = h('div', {
    class: `clip clip-${it.type}${it.id === state.selection ? ' selected' : ''}${tr.hidden ? ' dim' : ''}`,
    dataset: { id: it.id },
    style: { transform: `translateX(${left}px)`, width: `${width}px` },
  });
  const strip = h('div', { class: 'clip-strip' });
  if (it.type === 'video' && m?.thumbs?.length) fillFilmstrip(strip, it, m, width);
  else if (it.type === 'image' && m?.thumbs?.length) strip.style.backgroundImage = `url(${m.thumbs[0]})`;
  if ((it.type === 'audio') && m?.peaks) strip.append(waveCanvas(it, m, width, ROW_H.audio - 6));
  el.append(strip,
    h('div', { class: 'clip-label' }, icon(typeLabel, 12), h('span', null, name),
      it.speed && it.speed !== 1 ? h('em', null, `${it.speed}×`) : null,
      it.muted && it.type !== 'image' ? icon('volumeX', 12) : null),
    h('div', { class: 'clip-h clip-h-l', dataset: { trim: 'l' } }),
    h('div', { class: 'clip-h clip-h-r', dataset: { trim: 'r' } }));
  if (it.fadeIn > 0) el.append(h('div', { class: 'clip-fade l', style: { width: `${Math.min(width / 2, it.fadeIn * state.zoom)}px` } }));
  if (it.fadeOut > 0) el.append(h('div', { class: 'clip-fade r', style: { width: `${Math.min(width / 2, it.fadeOut * state.zoom)}px` } }));
  return el;
}

function fillFilmstrip(strip, it, m, width) {
  const th = 58;
  const tw = Math.max(30, Math.round(th * ((m.width || 16) / (m.height || 9))));
  const n = Math.min(160, Math.ceil(width / tw));
  const frag = document.createDocumentFragment();
  for (let i = 0; i < n; i++) {
    const tl = (i + 0.5) * tw / state.zoom;
    const src = (it.trimStart || 0) + tl * (it.speed || 1);
    const idx = clamp(Math.floor((src / Math.max(0.01, m.duration)) * m.thumbs.length), 0, m.thumbs.length - 1);
    frag.append(h('div', { class: 'film', style: { width: `${tw}px`, backgroundImage: `url(${m.thumbs[idx]})` } }));
  }
  strip.append(frag);
}

function waveCanvas(it, m, width, height) {
  const w = Math.min(Math.ceil(width), 8000);
  const c = h('canvas', { class: 'wave', width: w, height, style: { width: `${w}px`, height: `${height}px` } });
  const ctx = c.getContext('2d');
  const { perSecond, data } = m.peaks;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  const mid = height / 2;
  for (let x = 0; x < w; x += 2) {
    const t0 = (it.trimStart || 0) + (x / state.zoom) * (it.speed || 1);
    const t1 = (it.trimStart || 0) + ((x + 2) / state.zoom) * (it.speed || 1);
    let mx = 0;
    for (let i = Math.floor(t0 * perSecond); i <= Math.floor(t1 * perSecond) && i < data.length; i++) mx = Math.max(mx, data[i]);
    const a = (mx / 255) * mid * (it.volume ?? 1);
    ctx.fillRect(x, mid - a, 1.4, Math.max(1, a * 2));
  }
  return c;
}

let visualIndex = 0;
function renderRows() {
  if (!rowsEl) return;
  const p = state.project;
  rowsEl.replaceChildren();
  visualIndex = p.tracks.filter((t) => t.kind === 'visual').length;
  let vi = visualIndex;
  for (const tr of p.tracks) {
    const lane = h('div', { class: 'tl-lane' });
    for (const it of tr.items) lane.append(clipEl(it, tr));
    const row = h('div', { class: `tl-row tl-row-${tr.kind}`, dataset: { track: tr.id, kind: tr.kind }, style: { height: `${ROW_H[tr.kind]}px` } },
      trackHeader(tr, tr.kind === 'visual' ? vi-- : 0), lane);
    rowsEl.append(row);
  }
  dropNew.classList.toggle('empty', p.tracks.length === 0);
  dropNew.querySelector('span').textContent = p.tracks.length ? 'Suelta aquí para crear una pista nueva' : 'Arrastra videos, imágenes o audio aquí para empezar';
  sizeContent();
  drawRuler();
  updatePlayhead();
}

function markSelection() {
  rowsEl.querySelectorAll('.clip.selected').forEach((c) => c.classList.remove('selected'));
  if (state.selection) rowsEl.querySelector(`.clip[data-id="${state.selection}"]`)?.classList.add('selected');
}

// ---------- arrastrar / recortar ----------
function snapPoints(excludeId) {
  const pts = [0, state.time];
  for (const tr of state.project.tracks) for (const i of tr.items) if (i.id !== excludeId) pts.push(i.start, i.start + i.duration);
  return pts;
}
function snapValue(v, pts, thr) {
  let best = null, bd = thr;
  for (const p of pts) { const d = Math.abs(p - v); if (d < bd) { bd = d; best = p; } }
  return best;
}

function onRowsPointerDown(e) {
  if (e.button !== 0) return;
  const clip = e.target.closest('.clip');
  if (!clip) {
    if (e.target.closest('.tl-head')) return;
    select(null);
    scrubStart(e);
    return;
  }
  const found = findItem(clip.dataset.id);
  if (!found) return;
  e.preventDefault();
  select(found.item.id);
  const it = found.item;
  const trim = e.target.dataset.trim;
  const st = {
    it, clip, mode: trim ? `trim-${trim}` : 'move', startX: e.clientX, startY: e.clientY, moved: false,
    orig: { start: it.start, duration: it.duration, trimStart: it.trimStart || 0, track: found.track },
    targetTrack: found.track, newTrackAt: null,
  };
  const move = (ev) => onDragMove(ev, st);
  const up = (ev) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    onDragEnd(ev, st);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function onDragMove(e, st) {
  const dxPx = e.clientX - st.startX;
  if (!st.moved) {
    if (Math.abs(dxPx) < 3 && Math.abs(e.clientY - st.startY) < 3) return;
    st.moved = true;
    dragging = true;
    checkpoint();
    st.clip.classList.add('dragging');
  }
  const it = st.it;
  const dt = dxPx / state.zoom;
  const thr = 9 / state.zoom;
  const pts = state.magnet ? snapPoints(it.id) : [];
  const speed = it.speed || 1;
  if (st.mode === 'move') {
    let ns = Math.max(0, st.orig.start + dt);
    if (state.magnet) {
      const s1 = snapValue(ns, pts, thr);
      const s2 = snapValue(ns + it.duration, pts, thr);
      if (s1 != null && (s2 == null || Math.abs(s1 - ns) <= Math.abs(s2 - ns - it.duration))) ns = s1;
      else if (s2 != null) ns = s2 - it.duration;
    }
    it.start = Math.max(0, ns);
    // pista destino
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const row = under?.closest?.('.tl-row');
    const kind = trackKindFor(it.type);
    rowsEl.querySelectorAll('.tl-row.drop-target').forEach((r) => r.classList.remove('drop-target'));
    dropNew.classList.remove('drop-target');
    if (row && row.dataset.kind === kind) {
      const tr = state.project.tracks.find((t) => t.id === row.dataset.track);
      if (tr) {
        st.targetTrack = tr; st.newTrackAt = null;
        if (tr !== st.orig.track) row.classList.add('drop-target');
        const lane = row.querySelector('.tl-lane');
        if (st.clip.parentElement !== lane) lane.append(st.clip);
      }
    } else if (under?.closest?.('.tl-drop-new')) {
      st.newTrackAt = 'end'; dropNew.classList.add('drop-target');
    }
  } else if (st.mode === 'trim-l') {
    const minStart = (it.type === 'video' || it.type === 'audio') ? st.orig.start - st.orig.trimStart / speed : -Infinity;
    let ns = clamp(st.orig.start + dt, Math.max(0, minStart), st.orig.start + st.orig.duration - 0.1);
    if (state.magnet) { const s = snapValue(ns, pts, thr); if (s != null && s >= Math.max(0, minStart) && s < st.orig.start + st.orig.duration - 0.1) ns = s; }
    it.start = ns;
    it.duration = st.orig.start + st.orig.duration - ns;
    it.trimStart = Math.max(0, st.orig.trimStart + (ns - st.orig.start) * speed);
  } else if (st.mode === 'trim-r') {
    const maxD = mediaMaxDuration({ ...it, trimStart: st.orig.trimStart });
    let ne = clamp(st.orig.start + st.orig.duration + dt, st.orig.start + 0.1, st.orig.start + maxD);
    if (state.magnet) { const s = snapValue(ne, pts, thr); if (s != null && s > st.orig.start + 0.1 && s <= st.orig.start + maxD) ne = s; }
    it.duration = ne - it.start;
  }
  st.clip.style.transform = `translateX(${it.start * state.zoom}px)`;
  st.clip.style.width = `${Math.max(4, it.duration * state.zoom)}px`;
  st.clip.dataset.tip = st.mode === 'move' ? fmtTime(it.start) : fmtTime(it.duration);
  changed({ live: true, source: 'timeline' });
}

function onDragEnd(e, st) {
  dragging = false;
  rowsEl.querySelectorAll('.tl-row.drop-target').forEach((r) => r.classList.remove('drop-target'));
  dropNew.classList.remove('drop-target');
  if (!st.moved) return;
  const it = st.it;
  if (st.mode === 'move') {
    const src = st.orig.track;
    const kind = trackKindFor(it.type);
    if (st.newTrackAt) {
      src.items.splice(src.items.indexOf(it), 1);
      const nt = insertTrack(newTrack(kind), kind === 'visual' ? state.project.tracks.filter((t) => t.kind !== 'audio').length : undefined);
      nt.items.push(it);
    } else {
      const dst = st.targetTrack;
      if (trackOverlaps(dst, it, it.id)) {
        src.items.splice(src.items.indexOf(it), 1);
        const nt = newTrack(kind);
        insertTrack(nt, state.project.tracks.indexOf(dst));
        nt.items.push(it);
      } else if (dst !== src) {
        src.items.splice(src.items.indexOf(it), 1);
        dst.items.push(it);
      }
    }
  }
  changed({ source: 'timeline-end' });
}

// ---------- soltar desde la biblioteca / el sistema ----------
function setupDrop(el, isNew = false) {
  el.addEventListener('dragover', (e) => {
    const types = [...(e.dataTransfer?.types || [])];
    if (!types.includes('application/x-cinta-media') && !types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const row = e.target.closest?.('.tl-row');
    el.querySelectorAll?.('.tl-row.drop-target').forEach((r) => r !== row && r.classList.remove('drop-target'));
    (isNew ? el : row)?.classList.add('drop-target');
  });
  el.addEventListener('dragleave', (e) => {
    if (!el.contains(e.relatedTarget)) {
      el.classList.remove('drop-target');
      el.querySelectorAll?.('.drop-target').forEach((r) => r.classList.remove('drop-target'));
    }
  });
  el.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove('drop-target');
    el.querySelectorAll?.('.drop-target').forEach((r) => r.classList.remove('drop-target'));
    const at = tAtClient(e.clientX);
    const row = isNew ? null : e.target.closest('.tl-row');
    let medias = [];
    const id = e.dataTransfer.getData('application/x-cinta-media');
    if (id && state.media.get(id)) medias = [state.media.get(id)];
    else if (e.dataTransfer.files?.length) medias = await importFiles(e.dataTransfer.files);
    if (!medias.length) return;
    checkpoint();
    let t = at;
    let last;
    for (const m of medias) {
      const it = makeMediaItem(m);
      it.start = t;
      const kind = trackKindFor(it.type);
      if (row && row.dataset.kind === kind) placeItem(it, { trackId: row.dataset.track });
      else if (isNew) {
        const nt = insertTrack(newTrack(kind), kind === 'visual' ? state.project.tracks.filter((x) => x.kind !== 'audio').length : undefined);
        nt.items.push(it);
      } else placeItem(it, {});
      t += it.duration;
      last = it;
    }
    changed();
    if (last) select(last.id);
  });
}

// ---------- menú contextual ----------
let menuEl;
function closeMenu() { menuEl?.remove(); menuEl = null; }
function onContext(e) {
  const clip = e.target.closest('.clip');
  if (!clip) return;
  e.preventDefault();
  const found = findItem(clip.dataset.id);
  if (!found) return;
  select(found.item.id);
  closeMenu();
  const it = found.item;
  const entry = (label, ic, fn, kbd) => h('button', { class: 'menu-item', onclick: () => { closeMenu(); fn(); } }, icon(ic, 15), h('span', null, label), kbd ? h('kbd', null, kbd) : null);
  menuEl = h('div', { class: 'ctx-menu', style: { left: `${e.clientX}px`, top: `${e.clientY}px` } },
    entry('Dividir aquí', 'scissors', splitAtPlayhead, 'S'),
    entry('Duplicar', 'copy', duplicateSelected, 'Ctrl+D'),
    entry('Copiar', 'copy', copySelected, 'Ctrl+C'),
    it.type === 'video' ? entry('Separar audio', 'detach', () => detachAudio(it)) : null,
    entry('Eliminar', 'trash', deleteSelected, 'Supr'));
  document.body.append(menuEl);
  const r = menuEl.getBoundingClientRect();
  if (r.bottom > innerHeight) menuEl.style.top = `${innerHeight - r.height - 8}px`;
  if (r.right > innerWidth) menuEl.style.left = `${innerWidth - r.width - 8}px`;
  setTimeout(() => document.addEventListener('pointerdown', (ev) => { if (!menuEl?.contains(ev.target)) closeMenu(); }, { once: true }), 0);
}

export function timelineHead() { return HEAD; }
export { fitZoom };

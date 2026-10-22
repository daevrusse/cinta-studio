// Vista previa: lienzo escalado, selección y manipulación directa (mover, escalar, rotar).
import { state, on, emit, select, checkpoint, changed, findItem, isActive } from './state.js';
import { attachCanvas, requestRender } from './player.js';
import { hitTest, itemBox, toLocal } from './renderer.js';
import { h } from './ui.js';

let stage, frame, canvas, overlay, box, guideV, guideH, emptyHint;
let view = { scale: 1, left: 0, top: 0, w: 0, h: 0 };

export function mountPreview(host) {
  canvas = h('canvas', { class: 'preview-canvas' });
  box = h('div', { class: 'sel-box hidden' },
    ...['nw', 'ne', 'sw', 'se', 'e', 'w', 'n', 's'].map((k) => h('div', { class: `hdl hdl-${k}`, dataset: { h: k } })),
    h('div', { class: 'hdl-rot', dataset: { h: 'rot' } }));
  guideV = h('div', { class: 'guide guide-v hidden' });
  guideH = h('div', { class: 'guide guide-h hidden' });
  emptyHint = h('div', { class: 'stage-empty' },
    h('div', { class: 'stage-empty-ic' }), h('strong', null, 'Tu video empieza aquí'),
    h('span', null, 'Sube archivos o arrástralos a la línea de tiempo'));
  overlay = h('div', { class: 'stage-overlay' }, box, guideV, guideH);
  frame = h('div', { class: 'stage-frame' }, canvas, overlay, emptyHint);
  stage = h('div', { class: 'stage' }, frame);
  host.append(stage);
  attachCanvas(canvas);

  new ResizeObserver(layout).observe(stage);
  overlay.addEventListener('pointerdown', onPointerDown);
  overlay.addEventListener('dblclick', onDblClick);
  stage.addEventListener('pointerdown', (e) => { if (e.target === stage) select(null); });
  on((what) => {
    if (what === 'project' || what === 'time' || what === 'select' || what === 'rendered') updateBox();
    if (what === 'project' || what === 'aspect') layout();
  });
}

function layout() {
  if (!state.project || !stage) return;
  const { width: W, height: H } = state.project;
  const r = stage.getBoundingClientRect();
  const pad = 24;
  const avW = Math.max(50, r.width - pad * 2), avH = Math.max(50, r.height - pad * 2);
  const s = Math.min(avW / W, avH / H);
  const w = Math.round(W * s), hh = Math.round(H * s);
  if (w === view.w && hh === view.h) return;
  view = { scale: s, w, h: hh };
  frame.style.width = `${w}px`;
  frame.style.height = `${hh}px`;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(hh * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${hh}px`;
  requestRender();
  updateBox();
}

function toProject(e) {
  const r = overlay.getBoundingClientRect();
  return { x: (e.clientX - r.left) / view.scale, y: (e.clientY - r.top) / view.scale };
}

function updateBox() {
  if (!box) return;
  emptyHint.classList.toggle('hidden', state.project.tracks.length > 0);
  const found = state.selection && findItem(state.selection);
  const it = found?.item;
  if (!it || it.type === 'audio' || it.type === 'subtitle' || !isActive(it, state.time) || found.track.hidden) {
    box.classList.add('hidden');
    return;
  }
  const b = itemBox(it);
  const s = view.scale;
  box.classList.remove('hidden');
  box.dataset.type = it.type;
  box.style.width = `${b.w * s}px`;
  box.style.height = `${b.h * s}px`;
  box.style.transform = `translate(${it.x * s - (b.w * s) / 2}px, ${it.y * s - (b.h * s) / 2}px) rotate(${it.rotation || 0}deg)`;
}

let drag = null;

function onPointerDown(e) {
  if (e.button !== 0) return;
  const p = toProject(e);
  const handle = e.target.dataset?.h;
  let it = state.selection ? findItem(state.selection)?.item : null;
  if (!handle) {
    const hit = hitTest(state.project, state.time, p.x, p.y);
    if (!hit) { select(null); return; }
    if (hit.id !== state.selection) select(hit.id);
    it = hit;
  }
  if (!it) return;
  e.preventDefault();
  overlay.setPointerCapture(e.pointerId);
  const b = itemBox(it);
  drag = {
    mode: handle || 'move', it, start: p, moved: false,
    orig: { x: it.x, y: it.y, w: it.w, h: it.h, size: it.size, rotation: it.rotation || 0, bh: b.h },
  };
  overlay.addEventListener('pointermove', onPointerMove);
  overlay.addEventListener('pointerup', onPointerUp, { once: true });
  overlay.addEventListener('pointercancel', onPointerUp, { once: true });
}

function onPointerMove(e) {
  if (!drag) return;
  const p = toProject(e);
  const { it, orig, mode } = drag;
  const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
  if (!drag.moved) {
    if (Math.hypot(dx, dy) * view.scale < 2) return;
    drag.moved = true;
    checkpoint();
  }
  const { width: W, height: H } = state.project;
  const snap = 8 / view.scale;
  guideV.classList.add('hidden'); guideH.classList.add('hidden');

  if (mode === 'move') {
    let nx = orig.x + dx, ny = orig.y + dy;
    if (!e.altKey) {
      if (Math.abs(nx - W / 2) < snap) { nx = W / 2; guideV.classList.remove('hidden'); }
      if (Math.abs(ny - H / 2) < snap) { ny = H / 2; guideH.classList.remove('hidden'); }
    }
    it.x = nx; it.y = ny;
  } else if (mode === 'rot') {
    const a = Math.atan2(p.y - it.y, p.x - it.x) * 180 / Math.PI + 90;
    let r = ((a % 360) + 360) % 360;
    if (r > 180) r -= 360;
    if (!e.shiftKey) for (const s of [-180, -90, 0, 90, 180]) if (Math.abs(r - s) < 4) r = s;
    if (e.shiftKey) r = Math.round(r / 15) * 15;
    it.rotation = Math.round(r * 10) / 10;
  } else {
    // escalado en el sistema local del item
    const lp = toLocal({ ...it, x: orig.x, y: orig.y }, p.x, p.y);
    const corner = mode.length === 2;
    if (corner) {
      const d0 = Math.hypot(orig.w / 2, orig.bh / 2);
      const d1 = Math.hypot(lp.x, lp.y);
      const k = Math.max(0.05, d1 / d0);
      if (it.type === 'text') {
        it.size = Math.max(8, Math.round(orig.size * k));
        it.w = Math.max(40, orig.w * k);
      } else {
        it.w = Math.max(8, orig.w * k);
        it.h = Math.max(8, orig.h * k);
      }
    } else if (mode === 'e' || mode === 'w') {
      const nw = Math.max(20, Math.abs(lp.x) * 2);
      it.w = nw;
    } else if ((mode === 'n' || mode === 's') && it.type !== 'text') {
      it.h = Math.max(4, Math.abs(lp.y) * 2);
    }
  }
  changed({ live: true, source: 'preview' });
}

function onPointerUp() {
  overlay.removeEventListener('pointermove', onPointerMove);
  guideV.classList.add('hidden'); guideH.classList.add('hidden');
  if (drag?.moved) changed({ source: 'preview' });
  drag = null;
}

function onDblClick(e) {
  const p = toProject(e);
  const hit = hitTest(state.project, state.time, p.x, p.y);
  if (hit && hit.type === 'text') {
    select(hit.id);
    emit('edit-text', { id: hit.id });
  }
}

export function previewView() { return view; }

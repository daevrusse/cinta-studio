import './styles.css';
import {
  state, on, emit, newProject, changed, resetHistory, undo, redo, canUndo, canRedo, projectDuration, select, defaultSubtitleStyle,
} from './state.js';
import { h, icon, iconBtn, btn, toast, modal, confirmDialog, progressBar, fmtTime, downloadBlob, debounce } from './ui.js';
import { restoreMedia, importFiles } from './media.js';
import { setKV, getKV, clearMedia } from './storage.js';
import { mountPreview } from './preview.js';
import { mountTimeline, fitZoom } from './timeline.js';
import { mountProperties } from './properties.js';
import { mountSidebar, setPanel } from './panels/index.js';
import { togglePlay, pause, seek, requestRender } from './player.js';
import {
  splitAtPlayhead, deleteSelected, rippleDeleteSelected, duplicateSelected, copySelected, pasteClipboard,
  nudgeSelected, stepFrame, addMediaToTimeline,
} from './actions.js';
import { exportVideo, outputSize, exportAudioOnly, snapshotPNG } from './export.js';

const app = document.getElementById('app');

// ---------- barra superior ----------
const nameInput = h('input', { class: 'proj-name', value: '', spellcheck: false, 'aria-label': 'Nombre del proyecto', maxLength: 80 });
nameInput.addEventListener('change', () => { state.project.name = nameInput.value.trim() || 'Proyecto sin título'; nameInput.value = state.project.name; changed({ source: 'name' }); });
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameInput.blur(); });
const undoBtn = iconBtn('undo', 'Deshacer (Ctrl+Z)', undo);
const redoBtn = iconBtn('redo', 'Rehacer (Ctrl+Y)', redo);
const saveEl = h('span', { class: 'save-state' });
const exportBtn = btn('Exportar', { icon: 'download', cls: 'primary', onClick: openExport });

const menuBtn = iconBtn('settings', 'Proyecto', (e) => openProjectMenu(e.currentTarget));
const topbar = h('header', { class: 'topbar' },
  h('div', { class: 'brand' },
    h('div', { class: 'logo', html: '<svg viewBox="0 0 64 64" width="28" height="28"><rect width="64" height="64" rx="16" fill="#FF5F3A"/><path d="M14 22c10-8 26-8 36 0M14 42c10 8 26 8 36 0" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M27 24.5v15l12-7.5z" fill="#fff"/></svg>' }),
    h('span', { class: 'brand-name' }, 'Cinta', h('em', null, 'Studio'))),
  h('div', { class: 'top-mid' }, nameInput, saveEl),
  h('div', { class: 'top-right' }, undoBtn, redoBtn, menuBtn, exportBtn));

// ---------- layout ----------
const sideHost = h('div', { class: 'side' });
const stageHost = h('main', { class: 'stage-host' });
const propsHost = h('div', { class: 'props-host' });
const tlHost = h('section', { class: 'tl-host' });
const resizer = h('div', { class: 'tl-resizer', title: 'Arrastra para cambiar el alto' });
const workspace = h('div', { class: 'workspace' }, sideHost, stageHost, propsHost);
app.append(topbar, workspace, resizer, tlHost);

// redimensionar la línea de tiempo
resizer.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  const startY = e.clientY;
  const startH = tlHost.getBoundingClientRect().height;
  const move = (ev) => {
    const hgt = Math.max(150, Math.min(window.innerHeight * 0.7, startH - (ev.clientY - startY)));
    document.documentElement.style.setProperty('--tl-h', `${hgt}px`);
  };
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); try { localStorage.setItem('cinta.tlh', getComputedStyle(document.documentElement).getPropertyValue('--tl-h')); } catch {} };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
});
try { const v = localStorage.getItem('cinta.tlh'); if (v) document.documentElement.style.setProperty('--tl-h', v); } catch {}

// ---------- carga ----------
async function boot() {
  const saved = await getKV('project');
  state.project = saved && saved.tracks ? saved : newProject();
  state.project.subtitleStyle ||= defaultSubtitleStyle();
  await restoreMedia();
  // limpia referencias a medios inexistentes
  for (const t of state.project.tracks) t.items = t.items.filter((i) => !i.mediaId || state.media.has(i.mediaId));
  nameInput.value = state.project.name;

  mountSidebar(sideHost);
  mountPreview(stageHost);
  mountTimeline(tlHost);
  mountProperties(propsHost);
  changed({ source: 'boot' });
  state.saveState = 'saved';
  updateSave();
  resetHistory();
  emit('loaded');
  if (saved?.tracks?.length) setTimeout(fitZoom, 50);
  requestRender();
}

// ---------- autoguardado ----------
const persist = debounce(async () => {
  state.saveState = 'saving'; updateSave();
  await setKV('project', JSON.parse(JSON.stringify(state.project)));
  state.saveState = 'saved'; updateSave();
}, 700);

function updateSave() {
  const s = state.saveState;
  saveEl.replaceChildren(s === 'saved' ? icon('check', 13) : h('span', { class: 'dot-anim' }), h('span', null, s === 'saved' ? 'Guardado' : 'Guardando…'));
  saveEl.className = `save-state ${s}`;
}

on((what, info) => {
  if (what === 'project' && info?.source !== 'boot' && !info?.live) persist();
  if (what === 'project' && info?.live) { state.saveState = 'dirty'; updateSave(); }
  if (what === 'history' || what === 'project') { undoBtn.disabled = !canUndo(); redoBtn.disabled = !canRedo(); }
  if (what === 'project') exportBtn.disabled = projectDuration() <= 0;
  if (what === 'history' && nameInput && state.project) nameInput.value = state.project.name;
  if (what === 'select') document.body.classList.toggle('has-selection', !!state.selection);
});

window.addEventListener('beforeunload', (e) => {
  if (state.saveState !== 'saved') { e.preventDefault(); e.returnValue = ''; }
});

// ---------- menú de proyecto ----------
function openProjectMenu(anchor) {
  const r = anchor.getBoundingClientRect();
  const close = () => menu.remove();
  const item = (label, ic, fn) => h('button', { class: 'menu-item', onclick: () => { close(); fn(); } }, icon(ic, 15), h('span', null, label));
  const menu = h('div', { class: 'ctx-menu', style: { top: `${r.bottom + 6}px`, right: `${window.innerWidth - r.right}px` } },
    item('Nuevo proyecto', 'new', newProj),
    item('Guardar fotograma (PNG)', 'image', async () => { const b = await snapshotPNG(); downloadBlob(b, `${state.project.name} - ${fmtTime(state.time).replace(/[:.]/g, '-')}.png`); }),
    item('Exportar solo audio (WAV)', 'music', async () => { try { downloadBlob(await exportAudioOnly(), `${state.project.name}.wav`); } catch (e) { toast(e.message, 'error'); } }),
    item('Exportar proyecto (.json)', 'file', () => downloadBlob(new Blob([JSON.stringify(state.project, null, 2)], { type: 'application/json' }), `${state.project.name}.cinta.json`)),
    item('Atajos de teclado', 'keyboard', () => { select(null); toast('Los atajos están en el panel derecho cuando no hay nada seleccionado', 'info'); }));
  document.body.append(menu);
  setTimeout(() => document.addEventListener('pointerdown', (ev) => { if (!menu.contains(ev.target)) close(); }, { once: true }), 0);
}

async function newProj() {
  const ok = await confirmDialog('Nuevo proyecto', 'Se borrará el proyecto actual y los archivos subidos de este navegador. ¿Continuar?', 'Crear nuevo');
  if (!ok) return;
  pause();
  state.project = newProject();
  state.selection = null;
  for (const m of state.media.values()) URL.revokeObjectURL(m.url);
  state.media.clear();
  await clearMedia();
  nameInput.value = state.project.name;
  resetHistory();
  changed();
  emit('media');
  emit('select');
  emit('loaded');
  seek(0);
  setPanel('media');
}

// ---------- exportación ----------
function openExport() {
  if (projectDuration() <= 0) { toast('Añade algo a la línea de tiempo antes de exportar', 'info'); return; }
  pause();
  const opts = { shortSide: 1080, fps: state.project.fps || 30, quality: 'high', name: state.project.name || 'video' };
  const chip = (group, value, label, sub) => h('button', {
    type: 'button', class: `opt${opts[group] === value ? ' on' : ''}`,
    onclick: (e) => { opts[group] = value; e.currentTarget.parentElement.querySelectorAll('.on').forEach((x) => x.classList.remove('on')); e.currentTarget.classList.add('on'); info(); },
  }, h('strong', null, label), sub ? h('small', null, sub) : null);
  const infoEl = h('p', { class: 'muted small' });
  const info = () => {
    const { width, height } = outputSize(state.project, opts.shortSide);
    infoEl.textContent = `${width}×${height} · ${opts.fps} fps · ${fmtTime(projectDuration(), false)} · MP4 (H.264 + AAC)`;
  };
  const nameIn = h('input', { class: 'text-in', value: opts.name, oninput: (e) => { opts.name = e.target.value; } });
  const body = h('div', { class: 'export' },
    h('label', { class: 'mini-label' }, 'Nombre del archivo'), nameIn,
    h('label', { class: 'mini-label' }, 'Resolución'),
    h('div', { class: 'opts' }, chip('shortSide', 480, '480p', 'Ligero'), chip('shortSide', 720, '720p', 'HD'), chip('shortSide', 1080, '1080p', 'Full HD'), chip('shortSide', 1440, '1440p', '2K'), chip('shortSide', 2160, '4K', 'Ultra HD')),
    h('label', { class: 'mini-label' }, 'Fotogramas por segundo'),
    h('div', { class: 'opts' }, chip('fps', 24, '24', 'Cine'), chip('fps', 25, '25', 'PAL'), chip('fps', 30, '30', 'Estándar'), chip('fps', 60, '60', 'Fluido')),
    h('label', { class: 'mini-label' }, 'Calidad'),
    h('div', { class: 'opts' }, chip('quality', 'low', 'Baja', 'Archivo pequeño'), chip('quality', 'medium', 'Media', 'Equilibrada'), chip('quality', 'high', 'Alta', 'Recomendada')),
    infoEl,
    h('div', { class: 'row end gap', style: { marginTop: '18px' } },
      btn('Cancelar', { cls: 'ghost', onClick: () => close() }),
      btn('Exportar video', { icon: 'download', cls: 'primary', onClick: () => { close(); runExport(opts); } })));
  info();
  const close = modal('Exportar video', body, { width: 520 });
}

async function runExport(opts) {
  const ac = new AbortController();
  const pb = progressBar();
  const stage = h('strong', null, 'Preparando…');
  const pct = h('span', { class: 'pct' }, '0%');
  const eta = h('small', { class: 'muted' }, '');
  const result = h('div');
  const cancelBtn = btn('Cancelar', { cls: 'ghost', onClick: () => ac.abort() });
  const body = h('div', { class: 'export-run' }, h('div', { class: 'row between' }, stage, pct), pb.el, eta,
    h('p', { class: 'hint' }, 'Mantén esta pestaña abierta mientras se exporta. Todo el proceso ocurre en tu equipo.'),
    result, h('div', { class: 'row end' }, cancelBtn));
  let finished = false;
  const close = modal('Exportando…', body, { width: 480, closable: false });
  const t0 = performance.now();
  try {
    const out = await exportVideo({
      ...opts,
      signal: ac.signal,
      onStage: (s) => { stage.textContent = s; },
      onProgress: (p, rest) => {
        pb.set(p);
        pct.textContent = `${Math.floor(p * 100)}%`;
        eta.textContent = rest != null && isFinite(rest) ? `Tiempo restante aprox.: ${fmtTime(rest, false)}` : '';
      },
    });
    finished = true;
    const file = `${(opts.name || 'video').replace(/[\\/:*?"<>|]+/g, '-')}.mp4`;
    const url = URL.createObjectURL(out.blob);
    stage.textContent = '¡Listo!';
    eta.textContent = `${(out.blob.size / 1048576).toFixed(1)} MB · ${out.width}×${out.height} · ${((performance.now() - t0) / 1000).toFixed(0)} s`;
    cancelBtn.replaceWith(h('div', { class: 'row gap' },
      btn('Cerrar', { cls: 'ghost', onClick: () => { URL.revokeObjectURL(url); close(); } }),
      btn('Descargar MP4', { icon: 'download', cls: 'primary', onClick: () => downloadBlob(out.blob, file) })));
    result.append(h('video', { class: 'export-video', src: url, controls: true, playsInline: true }));
    if (out.codec !== 'avc' && out.codec !== 'h264') result.append(h('p', { class: 'hint' }, 'Tu navegador no tiene codificador H.264; el MP4 usa ' + out.codec.toUpperCase() + '. Para máxima compatibilidad exporta desde Chrome o Edge.'));
    downloadBlob(out.blob, file);
  } catch (e) {
    console.error(e);
    if (e.name === 'AbortError') { close(); toast('Exportación cancelada', 'info'); return; }
    stage.textContent = 'No se pudo exportar';
    eta.textContent = String(e.message || e);
    cancelBtn.replaceWith(btn('Cerrar', { cls: 'ghost', onClick: () => close() }));
  }
  void finished;
}

// ---------- atajos de teclado ----------
window.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
  if (document.querySelector('.modal-wrap')) return;
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (k === ' ' || e.code === 'Space') { e.preventDefault(); togglePlay(); }
  else if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
  else if (mod && k === 'd') { e.preventDefault(); duplicateSelected(); }
  else if (mod && k === 'c') { if (copySelected()) e.preventDefault(); }
  else if (mod && k === 'v') { if (state.clipboard) { e.preventDefault(); pasteClipboard(); } }
  else if (mod && k === 's') { e.preventDefault(); persist(); toast('Proyecto guardado en este navegador', 'success', 1500); }
  else if (mod && k === 'e') { e.preventDefault(); openExport(); }
  else if (k === 's' && !mod) { e.preventDefault(); splitAtPlayhead(); }
  else if (k === 'delete' || k === 'backspace') { e.preventDefault(); e.shiftKey ? rippleDeleteSelected() : deleteSelected(); }
  else if (k === 'escape') select(null);
  else if (k === 'home') { e.preventDefault(); seek(0); }
  else if (k === 'end') { e.preventDefault(); seek(projectDuration()); }
  else if (k.startsWith('arrow')) {
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    if (e.altKey || (state.selection && !e.ctrlKey && (k === 'arrowup' || k === 'arrowdown'))) {
      const map = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] };
      if (nudgeSelected(...map[k])) return;
    }
    if (k === 'arrowleft') e.shiftKey ? seek(state.time - 1) : stepFrame(-1);
    if (k === 'arrowright') e.shiftKey ? seek(state.time + 1) : stepFrame(1);
  }
});

// soltar archivos en cualquier parte de la app
window.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
window.addEventListener('drop', async (e) => {
  if (!e.dataTransfer?.files?.length) return;
  e.preventDefault();
  const ms = await importFiles(e.dataTransfer.files);
  const wasEmpty = state.project.tracks.length === 0;
  if (wasEmpty) for (const m of ms) addMediaToTimeline(m);
});

// pegar imágenes desde el portapapeles
window.addEventListener('paste', async (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') return;
  const files = [...(e.clipboardData?.files || [])];
  if (!files.length) return;
  e.preventDefault();
  const ms = await importFiles(files);
  ms.forEach((m) => addMediaToTimeline(m, { at: state.time }));
});

boot().catch((e) => {
  console.error(e);
  app.replaceChildren(h('div', { class: 'fatal' }, h('h2', null, 'No se pudo iniciar el editor'), h('p', null, String(e.message || e))));
});

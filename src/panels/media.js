// Panel "Archivos": subir, organizar y añadir medios propios.
import { state, on, allItems, checkpoint, changed, removeItem } from '../state.js';
import { h, icon, iconBtn, fmtDur, toast, confirmDialog, spinner } from '../ui.js';
import { importFiles, removeMedia } from '../media.js';
import { addMediaToTimeline } from '../actions.js';

let filter = 'all';

export function render(root) {
  const fileInput = h('input', { type: 'file', multiple: true, accept: 'video/*,audio/*,image/*,.mkv,.mov,.avi', hidden: true });
  const busy = h('div', { class: 'import-busy hidden' }, spinner(16), h('span', null, 'Importando…'));
  const doImport = async (files) => {
    if (!files?.length) return;
    busy.classList.remove('hidden');
    try { await importFiles(files); } finally { busy.classList.add('hidden'); }
  };
  fileInput.addEventListener('change', () => { doImport(fileInput.files); fileInput.value = ''; });

  const drop = h('div', { class: 'dropzone', tabIndex: 0, role: 'button', onclick: () => fileInput.click(), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); } },
    h('div', { class: 'dropzone-ic' }, icon('upload', 22)),
    h('strong', null, 'Haz clic para subir'),
    h('span', null, 'o arrastra y suelta tus archivos aquí'),
    h('small', null, 'Video, imagen y audio · se guardan solo en tu navegador'));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); drop.classList.remove('over'); doImport(e.dataTransfer.files); });

  const tabs = h('div', { class: 'chips' }, [['all', 'Todo'], ['video', 'Videos'], ['image', 'Imágenes'], ['audio', 'Audio']].map(([k, l]) =>
    h('button', { type: 'button', class: `chip${filter === k ? ' on' : ''}`, onclick: (e) => { filter = k; tabs.querySelectorAll('.on').forEach((x) => x.classList.remove('on')); e.currentTarget.classList.add('on'); draw(); } }, l)));
  const grid = h('div', { class: 'media-grid' });
  const empty = h('p', { class: 'muted center small' });

  root.append(fileInput, drop, busy, tabs, grid, empty);

  function draw() {
    grid.replaceChildren();
    const used = new Set(allItems().map((i) => i.mediaId));
    const list = [...state.media.values()].filter((m) => filter === 'all' || m.type === filter).sort((a, b) => (b.added || 0) - (a.added || 0));
    empty.textContent = list.length ? '' : state.media.size ? 'No hay archivos de este tipo.' : 'Aún no subiste archivos.';
    for (const m of list) grid.append(card(m, used.has(m.id)));
  }

  on((what, info) => {
    if (what === 'media' || (what === 'panel' && info.id === 'media') || (what === 'project' && !info?.live && root.offsetParent)) draw();
  });
  draw();
}

function card(m, used) {
  const thumb = m.thumbs?.[Math.floor((m.thumbs.length - 1) / 2)] || m.thumbs?.[0];
  const el = h('div', { class: `mcard mcard-${m.type}`, draggable: true, title: m.name },
    h('div', { class: 'mcard-thumb', style: thumb ? { backgroundImage: `url(${thumb})` } : null },
      m.type === 'audio' ? waveMini(m) : null,
      m.duration && m.type !== 'image' ? h('span', { class: 'badge' }, fmtDur(m.duration)) : null,
      used ? h('span', { class: 'badge used', title: 'En uso en la línea de tiempo' }, icon('check', 11)) : null,
      h('button', { type: 'button', class: 'mcard-add', title: 'Añadir a la línea de tiempo', onclick: (e) => { e.stopPropagation(); addMediaToTimeline(m); } }, icon('plus', 16))),
    h('div', { class: 'mcard-meta' }, icon(m.type === 'video' ? 'film' : m.type === 'audio' ? 'music' : 'image', 12), h('span', null, m.name),
      iconBtn('trash', 'Eliminar archivo', async (e) => {
        e.stopPropagation();
        const usedBy = allItems().filter((i) => i.mediaId === m.id);
        if (usedBy.length) {
          const ok = await confirmDialog('Eliminar archivo', `"${m.name}" se usa en ${usedBy.length} clip(s). Se quitarán de la línea de tiempo.`, 'Eliminar');
          if (!ok) return;
          checkpoint();
          usedBy.forEach((i) => removeItem(i.id));
          changed();
        }
        await removeMedia(m.id);
        toast('Archivo eliminado', 'info');
      }, 'mini')));
  el.addEventListener('dblclick', () => addMediaToTimeline(m));
  el.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('application/x-cinta-media', m.id);
    e.dataTransfer.effectAllowed = 'copy';
    if (thumb) { const img = new Image(); img.src = thumb; e.dataTransfer.setDragImage(img, 40, 24); }
  });
  return el;
}

function waveMini(m) {
  const c = h('canvas', { width: 200, height: 70, class: 'wave-mini' });
  const ctx = c.getContext('2d');
  const d = m.peaks?.data || [];
  ctx.fillStyle = '#B9A6FF';
  const n = 50;
  for (let i = 0; i < n; i++) {
    const v = d[Math.floor((i / n) * d.length)] || 0;
    const hh = Math.max(2, (v / 255) * 60);
    ctx.fillRect(i * 4, 35 - hh / 2, 2.5, hh);
  }
  return c;
}

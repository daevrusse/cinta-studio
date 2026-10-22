// Panel "Audio": subir audio, música libre (Jamendo) y efectos de sonido.
import { h, icon, fmtDur, toast, spinner, debounce, btn } from '../ui.js';
import { importFiles, importFile, fetchRemote } from '../media.js';
import { addMediaToTimeline } from '../actions.js';
import { synthSfx } from '../audio.js';
import { searchStock, missingKeyNote } from './stock.js';

const SFX = [
  ['whoosh', 'Whoosh'], ['swoosh', 'Swoosh'], ['pop', 'Pop'], ['ding', 'Ding'], ['click', 'Clic'], ['tick', 'Tic'],
  ['boom', 'Boom'], ['rise', 'Subida'], ['beep', 'Beep'], ['applause', 'Aplausos'],
];

let previewAudio = null;
function stopPreview() { previewAudio?.pause(); previewAudio = null; document.querySelectorAll('.track-row.playing').forEach((r) => r.classList.remove('playing')); }

export function render(root) {
  const fileIn = h('input', { type: 'file', accept: 'audio/*', multiple: true, hidden: true });
  fileIn.addEventListener('change', async () => {
    const ms = await importFiles(fileIn.files);
    fileIn.value = '';
    ms.forEach((m) => addMediaToTimeline(m));
  });

  // --- música ---
  const input = h('input', { type: 'search', placeholder: 'Buscar música (ej. lofi, épica, alegre)' });
  const list = h('div', { class: 'track-list' });
  const status = h('div');
  const moreBtn = btn('Cargar más', { cls: 'ghost full hidden', onClick: () => load() });
  let q = '', page = 1, hasMore = true, loading = false, token = 0;
  const reset = () => { page = 1; hasMore = true; list.replaceChildren(); load(); };
  input.addEventListener('input', debounce(() => { q = input.value.trim(); reset(); }, 450));
  const moods = h('div', { class: 'chips small' }, ['lofi', 'chill', 'épica', 'alegre', 'corporativo', 'acústica', 'electrónica', 'piano'].map((m) =>
    h('button', { type: 'button', class: 'chip ghost', onclick: () => { input.value = m; q = m; reset(); } }, m)));

  async function load() {
    if (loading || !hasMore) return;
    loading = true;
    const my = ++token;
    status.replaceChildren(spinner(18));
    moreBtn.classList.add('hidden');
    try {
      const d = await searchStock('jamendo', 'audio', q, page);
      if (my !== token) return;
      status.replaceChildren();
      if (!d.results.length && page === 1) status.append(h('p', { class: 'muted small center' }, 'Sin resultados.'));
      d.results.forEach((r) => list.append(trackRow(r)));
      hasMore = d.hasMore; page++;
      moreBtn.classList.toggle('hidden', !hasMore);
    } catch (e) {
      if (my !== token) return;
      status.replaceChildren(e.code === 'missing_key' ? missingKeyNote('jamendo') : h('p', { class: 'muted small' }, 'No se pudo cargar la música.'));
    } finally { if (my === token) loading = false; }
  }

  function trackRow(r) {
    const playBtn = h('button', { type: 'button', class: 'icon-btn round', title: 'Escuchar' }, icon('play', 16));
    const row = h('div', { class: 'track-row' },
      playBtn,
      h('div', { class: 'track-info' }, h('strong', null, r.title), h('span', null, `${r.author}${r.tags ? ' · ' + r.tags : ''}`)),
      h('span', { class: 'track-dur' }, fmtDur(r.duration)),
      h('button', { type: 'button', class: 'icon-btn', title: 'Añadir a la línea de tiempo' }, icon('plus', 18)));
    playBtn.addEventListener('click', () => {
      if (row.classList.contains('playing')) { stopPreview(); playBtn.replaceChildren(icon('play', 16)); return; }
      stopPreview();
      document.querySelectorAll('.track-row .icon-btn.round').forEach((b) => b.replaceChildren(icon('play', 16)));
      previewAudio = new Audio(r.preview);
      previewAudio.volume = 0.8;
      previewAudio.play().catch(() => toast('No se pudo reproducir la vista previa', 'error'));
      row.classList.add('playing');
      playBtn.replaceChildren(icon('pause', 16));
    });
    row.lastChild.addEventListener('click', async (e) => {
      const b = e.currentTarget;
      b.replaceChildren(spinner(16));
      try {
        stopPreview();
        const m = await fetchRemote(r.url, { name: `${r.title} — ${r.author}`, type: 'audio', source: 'jamendo' });
        addMediaToTimeline(m, { at: 0 });
        toast('Música añadida', 'success');
      } catch { toast('No se pudo descargar la canción', 'error'); }
      b.replaceChildren(icon('plus', 18));
    });
    return row;
  }

  // --- efectos ---
  const sfxGrid = h('div', { class: 'sfx-grid' }, SFX.map(([k, l]) => {
    const b = h('button', { type: 'button', class: 'sfx' }, icon('volume', 14), h('span', null, l), h('i', { title: 'Añadir' }, icon('plus', 14)));
    let blob;
    const get = async () => (blob ||= await synthSfx(k));
    b.addEventListener('click', async (e) => {
      const add = e.target.closest('i');
      const bl = await get();
      if (add) {
        const m = await importFile(new File([bl], `${l}.wav`, { type: 'audio/wav' }), { name: `SFX · ${l}`, source: 'sfx' });
        addMediaToTimeline(m);
      } else {
        stopPreview();
        previewAudio = new Audio(URL.createObjectURL(bl));
        previewAudio.play();
      }
    });
    return b;
  }));

  root.append(
    h('button', { type: 'button', class: 'dropzone slim', onclick: () => fileIn.click() }, icon('upload', 18), h('span', null, 'Subir audio o música'), fileIn),
    h('h3', { class: 'panel-sub' }, 'Música libre de derechos'),
    h('div', { class: 'search' }, icon('search', 16), input), moods, status, list, moreBtn,
    h('p', { class: 'credit' }, 'Música de ', h('a', { href: 'https://www.jamendo.com', target: '_blank', rel: 'noopener' }, 'Jamendo'), ' (licencias Creative Commons; revisa la licencia de cada tema para uso comercial).'),
    h('h3', { class: 'panel-sub' }, 'Efectos de sonido'),
    h('p', { class: 'hint' }, 'Clic para escuchar · "+" para añadir en el cabezal.'),
    sfxGrid);
  load();
}

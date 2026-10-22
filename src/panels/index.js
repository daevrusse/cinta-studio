// Barra lateral: riel de iconos + panel activo.
import { state, emit } from '../state.js';
import { h, icon } from '../ui.js';

const PANELS = [
  { id: 'media', label: 'Archivos', icon: 'media', load: () => import('./media.js') },
  { id: 'generate', label: 'Generar', icon: 'sparkles', load: () => import('./generate.js'), badge: 'IA' },
  { id: 'videos', label: 'Videos', icon: 'film', load: () => import('./stock.js').then((m) => ({ render: (c) => m.renderStock(c, 'video') })) },
  { id: 'images', label: 'Imágenes', icon: 'image', load: () => import('./stock.js').then((m) => ({ render: (c) => m.renderStock(c, 'image') })) },
  { id: 'text', label: 'Texto', icon: 'type', load: () => import('./text.js') },
  { id: 'subtitles', label: 'Subtítulos', icon: 'captions', load: () => import('./subtitles.js') },
  { id: 'elements', label: 'Elementos', icon: 'shapes', load: () => import('./elements.js') },
  { id: 'audio', label: 'Audio', icon: 'music', load: () => import('./audio.js') },
  { id: 'voiceover', label: 'Voz en off', icon: 'mic', load: () => import('./voiceover.js') },
  { id: 'record', label: 'Grabar', icon: 'record', load: () => import('./record.js') },
  { id: 'canvas', label: 'Lienzo', icon: 'canvas', load: () => import('./canvas.js') },
];

let rail, panelHost, panelWrap;
const cache = new Map(); // id -> element (se conserva el estado de cada panel)

export function mountSidebar(host) {
  rail = h('nav', { class: 'rail', 'aria-label': 'Herramientas' }, PANELS.map((p) => h('button', {
    type: 'button', class: 'rail-btn', dataset: { id: p.id }, title: p.label, onclick: () => setPanel(p.id),
  }, icon(p.icon, 20), h('span', null, p.label), p.badge ? h('i', { class: 'rail-badge' }, p.badge) : null)));
  panelHost = h('div', { class: 'panel-scroll' });
  panelWrap = h('div', { class: 'panel' },
    h('div', { class: 'panel-head' }, h('h2', null, ''), h('button', { class: 'icon-btn panel-close', title: 'Cerrar panel', onclick: () => document.body.classList.toggle('panel-collapsed') }, icon('x', 16))),
    panelHost);
  host.append(rail, panelWrap);
  setPanel(state.panel);
}

export async function setPanel(id) {
  const p = PANELS.find((x) => x.id === id) || PANELS[0];
  state.panel = p.id;
  document.body.classList.remove('panel-collapsed');
  rail.querySelectorAll('.rail-btn').forEach((b) => b.classList.toggle('on', b.dataset.id === p.id));
  panelWrap.querySelector('h2').textContent = p.label;
  panelWrap.dataset.panel = p.id;
  let el = cache.get(p.id);
  if (!el) {
    el = h('div', { class: `panel-content panel-${p.id}` });
    cache.set(p.id, el);
    const mod = await p.load();
    mod.render(el);
    if (state.panel !== p.id) { el.classList.add('hidden'); panelHost.append(el); return; }
  }
  for (const c of panelHost.children) c.classList.add('hidden');
  if (el.parentElement !== panelHost) panelHost.append(el);
  el.classList.remove('hidden');
  emit('panel', { id: p.id });
}

// Panel "Elementos": formas, emojis y gráficos.
import { state, defaultShape, defaultText } from '../state.js';
import { h } from '../ui.js';
import { addItem } from '../actions.js';

const SHAPES = [
  ['rect', 'Rectángulo', '<rect x="4" y="9" width="40" height="30" rx="2"/>'],
  ['rect-r', 'Redondeado', '<rect x="4" y="9" width="40" height="30" rx="10"/>'],
  ['circle', 'Círculo', '<circle cx="24" cy="24" r="17"/>'],
  ['triangle', 'Triángulo', '<path d="M24 6l19 34H5z"/>'],
  ['star', 'Estrella', '<path d="M24 4l5.9 12.6 13.6 1.6-10 9.4 2.6 13.6L24 34.6 11.9 41.2l2.6-13.6-10-9.4 13.6-1.6z"/>'],
  ['heart', 'Corazón', '<path d="M24 41S6 30.5 6 17.8A9.3 9.3 0 0 1 24 13a9.3 9.3 0 0 1 18 4.8C42 30.5 24 41 24 41z"/>'],
  ['hexagon', 'Hexágono', '<path d="M44 24L34 41H14L4 24 14 7h20z"/>'],
  ['arrow', 'Flecha', '<path d="M4 19h24v-9l16 14-16 14v-9H4z"/>'],
  ['line', 'Línea', '<rect x="4" y="21" width="40" height="6" rx="3"/>'],
  ['bubble', 'Globo', '<path d="M6 8h36a2 2 0 0 1 2 2v20a2 2 0 0 1-2 2H22l-10 8v-8H6a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z"/>'],
  ['progress', 'Barra de progreso', '<rect x="4" y="20" width="40" height="8" rx="4" opacity=".35"/><rect x="4" y="20" width="24" height="8" rx="4"/>'],
];

const EMOJIS = '😀 😂 😍 🥳 😎 🤩 😮 😢 😡 👍 👏 🙌 🙏 💪 👀 🔥 ✨ 💥 ⭐ 🌟 ❤️ 💯 ✅ ❌ ⚡ 🎉 🎁 🎬 🎵 📣 📍 💡 🚀 🏆 💰 🛒 📦 ☕ 🍔 🍕 🌮 🌎 🌞 🌙 🌈 ⚽ 📱 💻'.split(' ');

export function render(root) {
  const svg = (inner) => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 48 48');
    s.innerHTML = inner;
    return s;
  };
  root.append(
    h('h3', { class: 'panel-sub' }, 'Formas'),
    h('div', { class: 'shape-grid' }, SHAPES.map(([k, label, path]) => h('button', {
      type: 'button', class: 'shape-btn', title: label,
      onclick: () => {
        const it = defaultShape(k === 'rect-r' ? 'rect' : k);
        it.name = label;
        if (k === 'rect-r') it.radius = Math.round(it.w * 0.18);
        if (k === 'progress') { it.start = 0; addItem(Object.assign(it, { duration: Math.max(5, totalDur()) }), { at: 0 }); return; }
        addItem(it);
      },
    }, svg(path), h('small', null, label)))),
    h('h3', { class: 'panel-sub' }, 'Emojis'),
    h('div', { class: 'emoji-grid' }, EMOJIS.map((e) => h('button', {
      type: 'button', class: 'emoji-btn', title: e,
      onclick: () => {
        const it = defaultText({ text: e, font: 'Manrope', size: Math.round(Math.min(state.project.width, state.project.height) * 0.16), w: Math.round(Math.min(state.project.width, state.project.height) * 0.25), name: 'Emoji', anim: { in: 'pop', out: 'pop', inDur: 0.5, outDur: 0.4, motion: 'none' } });
        addItem(it);
      },
    }, e))));
}

function totalDur() {
  let d = 0;
  for (const t of state.project.tracks) for (const i of t.items) d = Math.max(d, i.start + i.duration);
  return d;
}

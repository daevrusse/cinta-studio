// Panel "Lienzo": formato (relación de aspecto) y fondo.
import { state, on, emit, ASPECTS, allItems } from '../state.js';
import { h } from '../ui.js';
import { section, color, swatches, commit } from '../controls.js';
import { PALETTE } from '../constants.js';

const ASPECT_INFO = {
  '16:9': 'YouTube · horizontal', '9:16': 'TikTok · Reels · Shorts', '1:1': 'Instagram · cuadrado', '4:5': 'Instagram · vertical',
  '4:3': 'Clásico', '21:9': 'Cine · panorámico', '2:3': 'Pinterest',
};
const GRADIENTS = [['#FF5F3A', '#9B5CFF'], ['#0F2027', '#2C5364'], ['#FFB547', '#FF4D8D'], ['#3DDC97', '#2EC4F1'], ['#1E1B4B', '#000000'], ['#F1E4C3', '#C9A66B']];

export function setAspect(key) {
  const [W, H] = ASPECTS[key];
  const p = state.project;
  const kx = W / p.width, ky = H / p.height;
  const k = Math.min(kx, ky);
  for (const it of allItems()) {
    it.x *= kx; it.y *= ky;
    if (it.type === 'text') { it.size = Math.max(8, Math.round(it.size * k)); it.w *= kx; }
    else { it.w *= k; it.h *= k; }
  }
  p.subtitleStyle.size = Math.round(p.subtitleStyle.size * Math.max(k, Math.min(kx, ky)));
  p.aspect = key; p.width = W; p.height = H;
}

export function render(root) {
  const aspectGrid = h('div', { class: 'aspect-grid' });
  const bgBox = h('div');

  function draw() {
    const p = state.project;
    aspectGrid.replaceChildren(...Object.keys(ASPECTS).map((k) => {
      const [w, hh] = ASPECTS[k];
      const s = 34 / Math.max(w, hh);
      return h('button', { type: 'button', class: `aspect${p.aspect === k ? ' on' : ''}`, onclick: () => { commit(() => setAspect(k)); emit('aspect'); draw(); } },
        h('div', { class: 'aspect-ic' }, h('i', { style: { width: `${w * s}px`, height: `${hh * s}px` } })),
        h('strong', null, k), h('small', null, ASPECT_INFO[k]));
    }));
    const bg = p.background;
    bgBox.replaceChildren(
      h('div', { class: 'segmented full' }, [['color', 'Color'], ['gradient', 'Degradado'], ['blur', 'Desenfoque']].map(([k, l]) =>
        h('button', { type: 'button', class: bg.type === k ? 'on' : '', onclick: () => { commit(() => { bg.type = k; }); draw(); } }, l))),
      bg.type === 'blur' ? h('p', { class: 'hint' }, 'Rellena los bordes con una versión desenfocada del video o imagen de fondo. Ideal para pasar videos horizontales a vertical.') : null,
      color(bg.type === 'gradient' ? 'Color inicial' : 'Color de fondo', bg.color, (v) => { bg.color = v; }),
      bg.type !== 'gradient' ? swatches(PALETTE, bg.color, (v) => { bg.color = v; }) : null,
      bg.type === 'gradient' ? color('Color final', bg.color2, (v) => { bg.color2 = v; }) : null,
      bg.type === 'gradient' ? h('div', { class: 'grad-grid' }, GRADIENTS.map(([a, b]) => h('button', {
        type: 'button', class: 'grad', style: { background: `linear-gradient(135deg, ${a}, ${b})` }, onclick: () => { commit(() => { bg.color = a; bg.color2 = b; }); draw(); },
      }))) : null);
  }

  root.append(section('Formato', aspectGrid), section('Fondo', bgBox));
  on((what) => { if (what === 'history' || what === 'loaded') draw(); });
  draw();
}

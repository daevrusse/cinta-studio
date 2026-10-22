// Panel "Texto": textos básicos y estilos prediseñados.
import { state, defaultText } from '../state.js';
import { h } from '../ui.js';
import { addItem } from '../actions.js';

const S = () => Math.min(state.project.width, state.project.height);

const BASIC = [
  { label: 'Añadir título', cls: 'tb-title', make: () => ({ text: 'Título principal', size: Math.round(S() * 0.11), font: 'Montserrat', bold: true }) },
  { label: 'Añadir subtítulo', cls: 'tb-sub', make: () => ({ text: 'Subtítulo', size: Math.round(S() * 0.065), font: 'Montserrat', bold: true }) },
  { label: 'Añadir texto normal', cls: 'tb-body', make: () => ({ text: 'Texto de cuerpo', size: Math.round(S() * 0.042), font: 'Manrope', bold: false, anim: { in: 'fade', out: 'fade', inDur: 0.4, outDur: 0.4, motion: 'none' } }) },
];

const PRESETS = [
  { name: 'Impacto', css: { font: '400 26px "Anton"', color: '#fff', textShadow: '0 3px 0 #000' }, text: 'IMPACTO',
    make: () => ({ text: 'TEXTO DE IMPACTO', font: 'Anton', bold: false, size: Math.round(S() * 0.12), stroke: { color: '#000000', width: Math.round(S() * 0.006) }, anim: { in: 'pop', out: 'fade', inDur: 0.5, outDur: 0.4, motion: 'none' } }) },
  { name: 'Neón', css: { font: '700 22px "Montserrat"', color: '#fff', textShadow: '0 0 8px #FF4D8D, 0 0 16px #FF4D8D' }, text: 'Neón',
    make: () => ({ text: 'Neón', font: 'Montserrat', color: '#FFFFFF', size: Math.round(S() * 0.11), shadow: { color: '#FF4D8D', opacity: 1, blur: 40, x: 0, y: 0 }, anim: { in: 'blur', out: 'fade', inDur: 0.7, outDur: 0.5, motion: 'none' } }) },
  { name: 'Caja', css: { font: '800 18px "Manrope"', color: '#111', background: '#FFE14D', padding: '4px 10px', borderRadius: '6px' }, text: 'Caja',
    make: () => ({ text: 'Texto en caja', font: 'Manrope', color: '#111111', size: Math.round(S() * 0.06), bg: { color: '#FFE14D', opacity: 1, padding: Math.round(S() * 0.025), radius: Math.round(S() * 0.015) }, anim: { in: 'slide-up', out: 'fade', inDur: 0.5, outDur: 0.4, motion: 'none' } }) },
  { name: 'Tercio inferior', css: { font: '700 14px "Inter"', color: '#fff', background: '#FF5F3A', padding: '4px 10px', borderRadius: '2px' }, text: 'Nombre Apellido',
    make: () => { const W = state.project.width, w = Math.round(W * (W < state.project.height ? 0.8 : 0.42)); return { text: 'Nombre Apellido\nCargo o descripción', font: 'Inter', size: Math.round(S() * 0.045), align: 'left', x: W * 0.08 + w / 2, y: state.project.height * 0.8, w, bg: { color: '#FF5F3A', opacity: 1, padding: Math.round(S() * 0.022), radius: 6 }, anim: { in: 'slide-left', out: 'slide-left', inDur: 0.6, outDur: 0.5, motion: 'none' } }; } },
  { name: 'Elegante', css: { font: 'italic 400 24px "Playfair Display"', color: '#F1E4C3' }, text: 'Elegante',
    make: () => ({ text: 'Una historia elegante', font: 'Playfair Display', bold: false, italic: true, color: '#F1E4C3', size: Math.round(S() * 0.08), anim: { in: 'fade', out: 'fade', inDur: 1, outDur: 1, motion: 'zoom-in' } }) },
  { name: 'Manuscrito', css: { font: '700 26px "Caveat"', color: '#fff' }, text: 'Manuscrito',
    make: () => ({ text: 'Hecho a mano', font: 'Caveat', size: Math.round(S() * 0.12), anim: { in: 'wipe', out: 'fade', inDur: 0.9, outDur: 0.5, motion: 'none' } }) },
  { name: 'Contorno', css: { font: '900 24px "Montserrat"', color: 'transparent', WebkitTextStroke: '1.5px #fff' }, text: 'Contorno',
    make: () => ({ text: 'CONTORNO', font: 'Montserrat', color: '#000000', size: Math.round(S() * 0.12), stroke: { color: '#FFFFFF', width: Math.round(S() * 0.004) }, anim: { in: 'zoom-out', out: 'fade', inDur: 0.6, outDur: 0.4, motion: 'none' } }) },
  { name: 'Retro', css: { font: '400 24px "Bangers"', color: '#FFB547', textShadow: '2px 2px 0 #E63946' }, text: 'Retro',
    make: () => ({ text: '¡RETRO!', font: 'Bangers', bold: false, color: '#FFB547', size: Math.round(S() * 0.13), letterSpacing: 4, shadow: { color: '#E63946', opacity: 1, blur: 0, x: 8, y: 8 }, anim: { in: 'bounce', out: 'fade', inDur: 0.8, outDur: 0.4, motion: 'none' } }) },
  { name: 'Máquina', css: { font: '500 16px "JetBrains Mono"', color: '#3DDC97' }, text: '> escribe_',
    make: () => ({ text: 'Escribiendo en tiempo real…', font: 'JetBrains Mono', bold: false, color: '#3DDC97', size: Math.round(S() * 0.05), align: 'left', anim: { in: 'typewriter', out: 'fade', inDur: 2, outDur: 0.4, motion: 'none' } }) },
  { name: 'Suscríbete', css: { font: '800 15px "Manrope"', color: '#fff', background: '#E63946', padding: '5px 12px', borderRadius: '999px' }, text: 'SUSCRÍBETE',
    make: () => ({ text: 'SUSCRÍBETE', font: 'Manrope', size: Math.round(S() * 0.05), letterSpacing: 2, y: state.project.height * 0.82, bg: { color: '#E63946', opacity: 1, padding: Math.round(S() * 0.025), radius: Math.round(S() * 0.1) }, anim: { in: 'pop', out: 'pop', inDur: 0.5, outDur: 0.4, motion: 'none' } }) },
  { name: 'Cita', css: { font: '400 18px "Merriweather"', color: '#fff', borderLeft: '3px solid #FF5F3A', paddingLeft: '8px' }, text: '“Cita”',
    make: () => ({ text: '“Lo simple es lo más difícil de lograr.”', font: 'Merriweather', bold: false, size: Math.round(S() * 0.055), lineHeight: 1.4, anim: { in: 'fade', out: 'fade', inDur: 0.8, outDur: 0.8, motion: 'none' } }) },
  { name: 'Etiqueta', css: { font: '700 15px "Space Grotesk"', color: '#fff', background: '#4C6FFF', padding: '4px 10px', borderRadius: '4px' }, text: 'NUEVO',
    make: () => ({ text: 'NUEVO', font: 'Space Grotesk', size: Math.round(S() * 0.045), letterSpacing: 3, x: state.project.width * 0.2, y: state.project.height * 0.15, bg: { color: '#4C6FFF', opacity: 1, padding: Math.round(S() * 0.018), radius: 8 }, rotation: -6, anim: { in: 'rotate', out: 'fade', inDur: 0.5, outDur: 0.4, motion: 'none' } }) },
];

function add(over) {
  const base = defaultText();
  const o = over();
  const it = { ...base, ...o, anim: { ...base.anim, ...(o.anim || {}) }, bg: { ...base.bg, ...(o.bg || {}) }, stroke: { ...base.stroke, ...(o.stroke || {}) }, shadow: { ...base.shadow, ...(o.shadow || {}) } };
  it.w = o.w || Math.round(state.project.width * 0.8);
  it.duration = 4;
  addItem(it);
}

export function render(root) {
  root.append(
    h('div', { class: 'text-basic' }, BASIC.map((b) => h('button', { type: 'button', class: `text-btn ${b.cls}`, onclick: () => add(b.make) }, b.label))),
    h('h3', { class: 'panel-sub' }, 'Estilos'),
    h('div', { class: 'preset-grid' }, PRESETS.map((p) => h('button', { type: 'button', class: 'preset', title: p.name, onclick: () => add(p.make) },
      h('span', { class: 'preset-sample', style: p.css }, p.text), h('small', null, p.name)))),
    h('p', { class: 'hint' }, 'Consejo: haz doble clic sobre un texto en el lienzo para editarlo. Arrastra las esquinas para cambiar el tamaño.'));
}

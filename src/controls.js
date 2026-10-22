// Controles de formulario reutilizables para los paneles.
import { checkpoint, changed } from './state.js';
import { h, icon } from './ui.js';

let editing = false;
export function beginEdit() { if (!editing) { checkpoint(); editing = true; } }
export function endEdit() { if (editing) { editing = false; changed({ source: 'props' }); } }
window.addEventListener('pointerup', () => setTimeout(endEdit, 0));

// Aplica un cambio en vivo con un solo punto de deshacer por gesto.
export function live(fn) {
  beginEdit();
  fn();
  changed({ live: true, source: 'props' });
}
export function commit(fn) {
  checkpoint();
  fn();
  changed({ source: 'props' });
}

export function section(title, ...children) {
  return h('section', { class: 'psec' }, title ? h('h4', null, title) : null, ...children);
}

export function slider(label, { min, max, step = 1, value, onInput, fmt = (v) => v, unit = '' }) {
  const out = h('input', { class: 'num', type: 'number', min, max, step, value: round(value, step) });
  const range = h('input', { type: 'range', min, max, step, value });
  const paint = () => range.style.setProperty('--p', `${((+range.value - min) / (max - min)) * 100}%`);
  paint();
  range.addEventListener('input', () => { out.value = round(+range.value, step); paint(); live(() => onInput(+range.value)); });
  range.addEventListener('change', endEdit);
  out.addEventListener('change', () => {
    let v = parseFloat(out.value);
    if (isNaN(v)) v = value;
    range.value = v; paint();
    commit(() => onInput(v));
  });
  return h('div', { class: 'ctl ctl-slider' },
    h('label', null, h('span', null, label), h('span', { class: 'ctl-val' }, out, unit ? h('small', null, unit) : null)),
    range);
}
function round(v, step) {
  const d = String(step).includes('.') ? String(step).split('.')[1].length : 0;
  return Number(v).toFixed(d);
}

export function color(label, value, onInput, { allowNone = false } = {}) {
  const inp = h('input', { type: 'color', value: value || '#000000' });
  const hex = h('input', { class: 'hex', type: 'text', value: (value || '#000000').toUpperCase(), maxLength: 7, spellcheck: false });
  inp.addEventListener('input', () => { hex.value = inp.value.toUpperCase(); live(() => onInput(inp.value)); });
  inp.addEventListener('change', endEdit);
  hex.addEventListener('change', () => {
    let v = hex.value.trim();
    if (!v.startsWith('#')) v = '#' + v;
    if (/^#[0-9a-f]{6}$/i.test(v)) { inp.value = v; commit(() => onInput(v)); } else hex.value = inp.value.toUpperCase();
  });
  return h('div', { class: 'ctl ctl-color' }, h('label', null, label), h('div', { class: 'color-wrap' }, inp, hex));
}

export function swatches(colors, current, onPick) {
  return h('div', { class: 'swatches' }, colors.map((c) => h('button', {
    class: `swatch${c.toLowerCase() === (current || '').toLowerCase() ? ' on' : ''}`, style: { background: c }, title: c, type: 'button',
    onclick: (e) => { e.currentTarget.parentElement.querySelectorAll('.on').forEach((x) => x.classList.remove('on')); e.currentTarget.classList.add('on'); commit(() => onPick(c)); },
  })));
}

export function select(label, options, value, onChange) {
  const sel = h('select', null, Object.entries(options).map(([k, v]) => h('option', { value: k, selected: k === value }, v)));
  sel.value = value;
  sel.addEventListener('change', () => commit(() => onChange(sel.value)));
  return h('div', { class: 'ctl ctl-select' }, label ? h('label', null, label) : null, sel);
}

export function segmented(options, value, onChange, { icons = false } = {}) {
  const wrap = h('div', { class: 'segmented' });
  for (const [k, v] of Object.entries(options)) {
    wrap.append(h('button', {
      type: 'button', class: k === value ? 'on' : '', title: icons ? v[1] : v,
      onclick: () => { wrap.querySelectorAll('.on').forEach((x) => x.classList.remove('on')); wrap.querySelector(`[data-k="${k}"]`).classList.add('on'); commit(() => onChange(k)); },
      dataset: { k },
    }, icons ? icon(v[0], 16) : v));
  }
  return wrap;
}

export function toggle(label, value, onChange) {
  const inp = h('input', { type: 'checkbox', checked: !!value });
  inp.addEventListener('change', () => commit(() => onChange(inp.checked)));
  return h('label', { class: 'ctl ctl-toggle' }, h('span', null, label), h('span', { class: 'switch' }, inp, h('i')));
}

export function numberRow(fields) {
  return h('div', { class: 'num-row' }, fields.map(({ label, value, onChange, step = 1 }) => {
    const inp = h('input', { type: 'number', step, value: Math.round(value * 100) / 100 });
    inp.addEventListener('change', () => { const v = parseFloat(inp.value); if (!isNaN(v)) commit(() => onChange(v)); });
    return h('label', { class: 'num-field' }, h('span', null, label), inp);
  }));
}

export function textArea(value, onInput, { rows = 3, placeholder = '' } = {}) {
  const ta = h('textarea', { rows, placeholder, value: value || '', spellcheck: true });
  ta.addEventListener('focus', () => beginEdit());
  ta.addEventListener('input', () => { beginEdit(); onInput(ta.value); changed({ live: true, source: 'props' }); });
  ta.addEventListener('blur', endEdit);
  return ta;
}

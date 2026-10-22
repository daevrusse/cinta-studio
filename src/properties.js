// Panel derecho: propiedades del elemento seleccionado.
import { state, on, emit, findItem, select as selectItem, mediaMaxDuration } from './state.js';
import { h, icon, btn, iconBtn, fmtTime } from './ui.js';
import { FILTER_PRESETS, FILTER_DEFAULTS, ANIMS, MOTIONS, filterString } from './renderer.js';
import { FONTS, PALETTE } from './constants.js';
import {
  section, slider, color, swatches, select, segmented, toggle, numberRow, textArea, commit, live,
} from './controls.js';
import { deleteSelected, duplicateSelected, detachAudio } from './actions.js';
import { setPanel } from './panels/index.js';
import { seek, play, pause } from './player.js';

let root, body;
let pending = false;
const TYPE_NAMES = { video: 'Video', image: 'Imagen', audio: 'Audio', text: 'Texto', shape: 'Elemento', subtitle: 'Subtítulo' };
const openSecs = new Set(['pos', 'text', 'textstyle', 'anim', 'audio', 'shape', 'speed']);

export function mountProperties(host) {
  body = h('div', { class: 'props-body' });
  root = h('aside', { class: 'props' }, body);
  host.append(root);
  on((what, info) => {
    if (what === 'select') render();
    else if (what === 'project' && info?.source !== 'props') schedule();
    else if (what === 'edit-text') setTimeout(() => body.querySelector('textarea')?.focus(), 30);
  });
  render();
}

function schedule() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    if (root.contains(document.activeElement) && document.activeElement.tagName !== 'BUTTON') return;
    render();
  });
}

function group(id, title, ...children) {
  const d = h('details', { class: 'pgroup', open: openSecs.has(id) }, h('summary', null, h('span', null, title), icon('plus', 14)), h('div', { class: 'pgroup-body' }, ...children));
  d.addEventListener('toggle', () => (d.open ? openSecs.add(id) : openSecs.delete(id)));
  return d;
}

function render() {
  if (!body) return;
  const scroll = body.scrollTop;
  body.replaceChildren();
  const found = state.selection && findItem(state.selection);
  if (!found) { body.append(emptyView()); return; }
  const { item: it } = found;
  const m = it.mediaId ? state.media.get(it.mediaId) : null;
  body.append(h('div', { class: 'props-head' },
    h('div', null, h('small', null, TYPE_NAMES[it.type]), h('strong', null, headTitle(it, m))),
    h('div', { class: 'row gap-s' },
      iconBtn('copy', 'Duplicar', duplicateSelected),
      iconBtn('trash', 'Eliminar', deleteSelected, 'danger'),
      iconBtn('x', 'Deseleccionar', () => selectItem(null)))));

  body.append(timingGroup(it));
  if (it.type === 'text') body.append(...textGroups(it));
  if (it.type === 'subtitle') body.append(subtitleGroup(it));
  if (it.type === 'shape') body.append(shapeGroup(it));
  if (it.type === 'video' || it.type === 'image' || it.type === 'text' || it.type === 'shape') body.append(transformGroup(it, m));
  if (it.type === 'video' || it.type === 'image') body.append(cropGroup(it, m), filtersGroup(it, m));
  if (it.type === 'video' || it.type === 'audio') body.append(speedGroup(it), audioGroup(it, m));
  if (it.type !== 'audio' && it.type !== 'subtitle') body.append(animGroup(it));
  body.scrollTop = scroll;
}

function headTitle(it, m) {
  if (it.type === 'text' || it.type === 'subtitle') return (it.text || '').split('\n')[0].slice(0, 40) || '—';
  return it.name || m?.name || '—';
}

function emptyView() {
  const p = state.project;
  const kb = [['Espacio', 'Reproducir / pausar'], ['S', 'Dividir en el cabezal'], ['Supr', 'Eliminar'], ['Ctrl+Z / Ctrl+Y', 'Deshacer / rehacer'],
    ['Ctrl+D', 'Duplicar'], ['Ctrl+C / V', 'Copiar / pegar'], ['← →', 'Fotograma anterior / siguiente'], ['Mayús+← →', 'Saltar 1 segundo'],
    ['Inicio / Fin', 'Ir al inicio / final'], ['Ctrl+rueda', 'Zoom en la línea de tiempo'], ['Alt al mover', 'Desactivar guías']];
  return h('div', { class: 'props-empty' },
    h('div', { class: 'props-empty-ic' }, icon('layers', 26)),
    h('strong', null, 'Nada seleccionado'),
    h('p', { class: 'muted' }, 'Haz clic en un elemento del lienzo o de la línea de tiempo para editarlo.'),
    section('Proyecto',
      h('div', { class: 'kv' }, h('span', null, 'Formato'), h('b', null, `${p.aspect} · ${p.width}×${p.height}`)),
      h('div', { class: 'kv' }, h('span', null, 'Duración'), h('b', null, fmtTime(state.project.tracks.reduce((d, t) => Math.max(d, ...t.items.map((i) => i.start + i.duration)), 0)))),
      slider('Volumen general', { min: 0, max: 200, value: Math.round((p.masterVolume ?? 1) * 100), unit: '%', onInput: (v) => { p.masterVolume = v / 100; } }),
      btn('Formato y fondo', { icon: 'canvas', cls: 'ghost full', onClick: () => setPanel('canvas') })),
    section('Atajos de teclado', h('div', { class: 'kbd-list' }, kb.map(([k, v]) => h('div', null, h('kbd', null, k), h('span', null, v))))));
}

function timingGroup(it) {
  const max = mediaMaxDuration(it);
  return group('timing', 'Tiempo',
    numberRow([
      { label: 'Inicio (s)', value: it.start, step: 0.1, onChange: (v) => { it.start = Math.max(0, v); } },
      { label: 'Duración (s)', value: it.duration, step: 0.1, onChange: (v) => { it.duration = Math.max(0.1, Math.min(max, v)); } },
    ]),
    (it.type === 'video' || it.type === 'audio') ? h('p', { class: 'hint' }, `Recorte desde ${fmtTime(it.trimStart || 0)} del archivo original. Arrastra los bordes del clip para recortar.`) : null);
}

function transformGroup(it, m) {
  const { width: W, height: H } = state.project;
  const isMedia = it.type === 'video' || it.type === 'image';
  const aspect = it.w / it.h;
  const children = [
    numberRow([
      { label: 'X', value: it.x, onChange: (v) => { it.x = v; } },
      { label: 'Y', value: it.y, onChange: (v) => { it.y = v; } },
      ...(it.type !== 'text' ? [
        { label: 'Ancho', value: it.w, onChange: (v) => { const r = it.w / it.h; it.w = Math.max(2, v); if (isMedia) it.h = it.w / r; } },
        { label: 'Alto', value: it.h, onChange: (v) => { const r = it.w / it.h; it.h = Math.max(2, v); if (isMedia) it.w = it.h * r; } },
      ] : [{ label: 'Ancho caja', value: it.w, onChange: (v) => { it.w = Math.max(20, v); } }]),
    ]),
  ];
  if (isMedia || it.type === 'shape') {
    children.push(slider('Escala', {
      min: 5, max: 400, value: Math.round((it.w / W) * 100), unit: '%',
      onInput: (v) => { const nw = (W * v) / 100; const k = nw / it.w; it.w = nw; it.h *= k; },
    }));
  }
  if (isMedia) {
    children.push(h('div', { class: 'btn-row' },
      btn('Ajustar', { icon: 'fit', cls: 'ghost sm', onClick: () => commit(() => fit(it, m, 'contain')) }),
      btn('Llenar', { icon: 'canvas', cls: 'ghost sm', onClick: () => commit(() => fit(it, m, 'cover')) }),
      btn('Centrar', { icon: 'plus', cls: 'ghost sm', onClick: () => commit(() => { it.x = W / 2; it.y = H / 2; }) })));
  } else {
    children.push(h('div', { class: 'btn-row' },
      btn('Centrar', { icon: 'plus', cls: 'ghost sm', onClick: () => commit(() => { it.x = W / 2; it.y = H / 2; }) }),
      btn('Arriba', { cls: 'ghost sm', onClick: () => commit(() => { it.y = H * 0.15; }) }),
      btn('Abajo', { cls: 'ghost sm', onClick: () => commit(() => { it.y = H * 0.85; }) })));
  }
  children.push(
    slider('Rotación', { min: -180, max: 180, value: it.rotation || 0, unit: '°', onInput: (v) => { it.rotation = v; } }),
    slider('Opacidad', { min: 0, max: 100, value: Math.round((it.opacity ?? 1) * 100), unit: '%', onInput: (v) => { it.opacity = v / 100; } }));
  if (isMedia) {
    children.push(slider('Esquinas redondeadas', { min: 0, max: Math.round(Math.min(it.w, it.h) / 2), value: it.radius || 0, unit: 'px', onInput: (v) => { it.radius = v; } }),
      h('div', { class: 'btn-row' },
        btn('Voltear H', { icon: 'flipH', cls: `ghost sm${it.flipH ? ' on' : ''}`, onClick: () => commit(() => { it.flipH = !it.flipH; }) }),
        btn('Voltear V', { icon: 'flipV', cls: `ghost sm${it.flipV ? ' on' : ''}`, onClick: () => commit(() => { it.flipV = !it.flipV; }) })));
  }
  void aspect;
  return group('pos', 'Posición y tamaño', ...children);
}

function fit(it, m, mode) {
  const { width: W, height: H } = state.project;
  const c = it.crop || {};
  const mw = (m?.width || it.w) * (1 - (c.l || 0) - (c.r || 0));
  const mh = (m?.height || it.h) * (1 - (c.t || 0) - (c.b || 0));
  const s = mode === 'cover' ? Math.max(W / mw, H / mh) : Math.min(W / mw, H / mh);
  it.w = mw * s; it.h = mh * s; it.x = W / 2; it.y = H / 2; it.rotation = 0;
}

function cropGroup(it, m) {
  const set = (k, v) => {
    it.crop = { l: 0, t: 0, r: 0, b: 0, ...it.crop, [k]: v / 100 };
    const c = it.crop;
    const mw = (m?.width || 1) * (1 - c.l - c.r), mh = (m?.height || 1) * (1 - c.t - c.b);
    it.h = it.w * (mh / mw);
  };
  const c = it.crop || {};
  return group('crop', 'Recortar encuadre',
    slider('Izquierda', { min: 0, max: 45, value: Math.round((c.l || 0) * 100), unit: '%', onInput: (v) => set('l', v) }),
    slider('Derecha', { min: 0, max: 45, value: Math.round((c.r || 0) * 100), unit: '%', onInput: (v) => set('r', v) }),
    slider('Arriba', { min: 0, max: 45, value: Math.round((c.t || 0) * 100), unit: '%', onInput: (v) => set('t', v) }),
    slider('Abajo', { min: 0, max: 45, value: Math.round((c.b || 0) * 100), unit: '%', onInput: (v) => set('b', v) }),
    btn('Quitar recorte', { cls: 'ghost sm', onClick: () => commit(() => { it.crop = { l: 0, t: 0, r: 0, b: 0 }; fit(it, m, 'contain'); }) }));
}

function filtersGroup(it, m) {
  const thumb = m?.thumbs?.[Math.floor((m.thumbs.length || 1) / 2)] || m?.thumbs?.[0];
  const grid = h('div', { class: 'filter-grid' }, Object.entries(FILTER_PRESETS).map(([k, p]) => h('button', {
    type: 'button', class: `filter-chip${it.filterPreset === k ? ' on' : ''}`,
    onclick: () => commit(() => { it.filterPreset = k; it.filters = { ...FILTER_DEFAULTS, ...p.f }; }),
  }, h('div', { class: 'filter-thumb', style: { backgroundImage: thumb ? `url(${thumb})` : 'none', filter: filterString({ ...FILTER_DEFAULTS, ...p.f }) } }), h('span', null, p.label))));
  const f = it.filters || { ...FILTER_DEFAULTS };
  const sl = (label, key, min, max, unit = '') => slider(label, { min, max, value: f[key] ?? FILTER_DEFAULTS[key], unit, onInput: (v) => { it.filters = { ...FILTER_DEFAULTS, ...it.filters, [key]: v }; it.filterPreset = 'custom'; } });
  return group('filters', 'Filtros y ajustes', grid,
    sl('Brillo', 'brightness', 0, 200, '%'), sl('Contraste', 'contrast', 0, 200, '%'), sl('Saturación', 'saturation', 0, 300, '%'),
    sl('Tono', 'hue', -180, 180, '°'), sl('Desenfoque', 'blur', 0, 30, 'px'), sl('Escala de grises', 'grayscale', 0, 100, '%'), sl('Sepia', 'sepia', 0, 100, '%'),
    btn('Restablecer', { icon: 'refresh', cls: 'ghost sm', onClick: () => commit(() => { it.filters = { ...FILTER_DEFAULTS }; it.filterPreset = 'none'; }) }));
}

function speedGroup(it) {
  const setSpeed = (s) => {
    const old = it.speed || 1;
    it.speed = s;
    const nd = (it.duration * old) / s;
    it.duration = Math.max(0.1, Math.min(nd, mediaMaxDuration(it)));
  };
  return group('speed', 'Velocidad',
    segmented({ 0.25: '0.25×', 0.5: '0.5×', 1: '1×', 1.5: '1.5×', 2: '2×', 4: '4×' }, String(it.speed || 1), (v) => setSpeed(parseFloat(v))),
    slider('Personalizada', { min: 0.1, max: 8, step: 0.05, value: it.speed || 1, unit: '×', onInput: (v) => setSpeed(v) }));
}

function audioGroup(it, m) {
  const noAudio = it.type === 'video' && m && m.hasAudio === false;
  if (noAudio) return group('audio', 'Audio', h('p', { class: 'hint' }, 'Este video no tiene pista de audio.'));
  return group('audio', 'Audio',
    slider('Volumen', { min: 0, max: 200, value: Math.round((it.volume ?? 1) * 100), unit: '%', onInput: (v) => { it.volume = v / 100; } }),
    toggle('Silenciar', it.muted, (v) => { it.muted = v; }),
    slider('Aparecer (fade in)', { min: 0, max: Math.min(10, it.duration / 2), step: 0.1, value: it.fadeIn || 0, unit: 's', onInput: (v) => { it.fadeIn = v; } }),
    slider('Desvanecer (fade out)', { min: 0, max: Math.min(10, it.duration / 2), step: 0.1, value: it.fadeOut || 0, unit: 's', onInput: (v) => { it.fadeOut = v; } }),
    it.type === 'video' ? btn('Separar audio', { icon: 'detach', cls: 'ghost full', onClick: () => detachAudio(it) }) : null);
}

function animGroup(it) {
  const a = it.anim || (it.anim = { in: 'none', out: 'none', inDur: 0.6, outDur: 0.6, motion: 'none' });
  const opts = { ...ANIMS };
  if (it.type !== 'text') delete opts.typewriter;
  const maxD = Math.max(0.2, Math.min(5, it.duration / 2));
  return group('anim', 'Animación',
    select('Entrada', opts, a.in, (v) => { it.anim = { ...it.anim, in: v }; }),
    slider('Duración de entrada', { min: 0.1, max: maxD, step: 0.1, value: Math.min(a.inDur ?? 0.6, maxD), unit: 's', onInput: (v) => { it.anim.inDur = v; } }),
    select('Salida', opts, a.out, (v) => { it.anim = { ...it.anim, out: v }; }),
    slider('Duración de salida', { min: 0.1, max: maxD, step: 0.1, value: Math.min(a.outDur ?? 0.6, maxD), unit: 's', onInput: (v) => { it.anim.outDur = v; } }),
    it.type !== 'shape' ? select('Movimiento continuo', MOTIONS, a.motion || 'none', (v) => { it.anim = { ...it.anim, motion: v }; }) : null,
    btn('Vista previa', { icon: 'play', cls: 'ghost sm', onClick: () => previewItem(it) }));
}

function previewItem(it) {
  seek(it.start);
  play();
  setTimeout(() => { if (state.playing) pause(); }, Math.min(it.duration, 4) * 1000);
}

function textGroups(it) {
  const fontSel = h('select', { class: 'font-select' }, FONTS.map((f) => h('option', { value: f, style: { fontFamily: f }, selected: f === it.font }, f)));
  fontSel.value = it.font;
  fontSel.style.fontFamily = it.font;
  fontSel.addEventListener('change', () => { fontSel.style.fontFamily = fontSel.value; commit(() => { it.font = fontSel.value; }); document.fonts?.load(`700 40px "${fontSel.value}"`).then(() => emit('project', { source: 'font' })); });
  const styleBtns = h('div', { class: 'segmented multi' },
    ...[['bold', 'Negrita'], ['italic', 'Cursiva'], ['underline', 'Subrayado']].map(([k, t]) => h('button', {
      type: 'button', class: it[k] ? 'on' : '', title: t,
      onclick: (e) => { e.currentTarget.classList.toggle('on'); commit(() => { it[k] = !it[k]; }); },
    }, icon(k, 16))));
  const bg = it.bg || {}, st = it.stroke || {}, sh = it.shadow || {};
  return [
    group('text', 'Texto', textArea(it.text, (v) => { it.text = v; }, { rows: 3, placeholder: 'Escribe tu texto…' })),
    group('textstyle', 'Estilo de texto',
      h('div', { class: 'ctl' }, h('label', null, 'Fuente'), fontSel),
      slider('Tamaño', { min: 8, max: 400, value: it.size, unit: 'px', onInput: (v) => { it.size = v; } }),
      color('Color', it.color, (v) => { it.color = v; }),
      swatches(PALETTE.slice(0, 10), it.color, (v) => { it.color = v; }),
      h('div', { class: 'row gap' }, styleBtns,
        segmented({ left: ['alignL', 'Izquierda'], center: ['alignC', 'Centro'], right: ['alignR', 'Derecha'] }, it.align, (v) => { it.align = v; }, { icons: true })),
      toggle('MAYÚSCULAS', it.uppercase, (v) => { it.uppercase = v; }),
      slider('Espaciado de letras', { min: -10, max: 60, value: it.letterSpacing || 0, unit: 'px', onInput: (v) => { it.letterSpacing = v; } }),
      slider('Interlineado', { min: 0.7, max: 3, step: 0.05, value: it.lineHeight || 1.2, onInput: (v) => { it.lineHeight = v; } })),
    group('textbg', 'Fondo del texto',
      slider('Opacidad del fondo', { min: 0, max: 100, value: Math.round((bg.opacity || 0) * 100), unit: '%', onInput: (v) => { it.bg = { ...it.bg, opacity: v / 100 }; } }),
      color('Color de fondo', bg.color, (v) => { it.bg = { ...it.bg, color: v }; }),
      slider('Relleno', { min: 0, max: 120, value: bg.padding ?? 24, unit: 'px', onInput: (v) => { it.bg = { ...it.bg, padding: v }; } }),
      slider('Redondeo', { min: 0, max: 120, value: bg.radius ?? 16, unit: 'px', onInput: (v) => { it.bg = { ...it.bg, radius: v }; } })),
    group('textstroke', 'Contorno y sombra',
      slider('Grosor del contorno', { min: 0, max: 30, value: st.width || 0, unit: 'px', onInput: (v) => { it.stroke = { ...it.stroke, width: v }; } }),
      color('Color del contorno', st.color, (v) => { it.stroke = { ...it.stroke, color: v }; }),
      slider('Opacidad de sombra', { min: 0, max: 100, value: Math.round((sh.opacity || 0) * 100), unit: '%', onInput: (v) => { it.shadow = { ...it.shadow, opacity: v / 100 }; } }),
      slider('Difuminado de sombra', { min: 0, max: 80, value: sh.blur ?? 12, unit: 'px', onInput: (v) => { it.shadow = { ...it.shadow, blur: v }; } }),
      slider('Desplazamiento', { min: -40, max: 40, value: sh.y ?? 4, unit: 'px', onInput: (v) => { it.shadow = { ...it.shadow, y: v, x: v / 2 }; } }),
      color('Color de sombra', sh.color, (v) => { it.shadow = { ...it.shadow, color: v }; })),
  ];
}

function subtitleGroup(it) {
  return group('text', 'Subtítulo',
    textArea(it.text, (v) => { it.text = v; }, { rows: 3 }),
    btn('Estilo y lista de subtítulos', { icon: 'captions', cls: 'ghost full', onClick: () => setPanel('subtitles') }));
}

function shapeGroup(it) {
  return group('shape', 'Relleno y borde',
    color(it.shape === 'progress' ? 'Color de la barra' : 'Relleno', it.fill, (v) => { it.fill = v; }),
    swatches(PALETTE.slice(0, 10), it.fill, (v) => { it.fill = v; }),
    it.shape !== 'progress' ? slider('Grosor del borde', { min: 0, max: 40, value: it.strokeWidth || 0, unit: 'px', onInput: (v) => { it.strokeWidth = v; } }) : null,
    it.shape !== 'progress' ? color('Color del borde', it.strokeColor, (v) => { it.strokeColor = v; }) : null,
    it.shape === 'rect' || it.shape === 'progress' ? slider('Esquinas', { min: 0, max: Math.round(Math.min(it.w, it.h) / 2), value: it.radius || 0, unit: 'px', onInput: (v) => { it.radius = v; } }) : null);
}

export { live };

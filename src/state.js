// Estado global, historial (deshacer/rehacer) y modelo del proyecto.

export const uid = (p = 'id') => `${p}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-3)}`;

export const ASPECTS = {
  '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350],
  '4:3': [1440, 1080], '21:9': [2520, 1080], '2:3': [1080, 1620],
};

export const state = {
  project: null,
  media: new Map(),
  time: 0,
  playing: false,
  selection: null,
  zoom: 60,
  magnet: true,
  panel: 'media',
  clipboard: null,
  saveState: 'saved',
};

const listeners = new Set();
export function on(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit(what, info = {}) { for (const fn of listeners) fn(what, info); }

export function defaultSubtitleStyle() {
  return {
    font: 'Montserrat', size: 64, color: '#FFFFFF', bold: true, italic: false, uppercase: false,
    bgColor: '#000000', bgOpacity: 0.55, stroke: '#000000', strokeWidth: 0, position: 0.86, maxWidth: 0.86,
  };
}

export function newProject() {
  return {
    version: 1,
    id: uid('p'),
    name: 'Proyecto sin título',
    aspect: '16:9',
    width: 1920,
    height: 1080,
    fps: 30,
    background: { type: 'color', color: '#000000', color2: '#1E1B4B' },
    tracks: [],
    subtitleStyle: defaultSubtitleStyle(),
    masterVolume: 1,
  };
}

// ---------- historial ----------
const undoStack = [];
const redoStack = [];
export function checkpoint() {
  undoStack.push(JSON.stringify(state.project));
  if (undoStack.length > 150) undoStack.shift();
  redoStack.length = 0;
  emit('history');
}
export function canUndo() { return undoStack.length > 0; }
export function canRedo() { return redoStack.length > 0; }
export function undo() {
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify(state.project));
  state.project = JSON.parse(undoStack.pop());
  afterHistory();
}
export function redo() {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify(state.project));
  state.project = JSON.parse(redoStack.pop());
  afterHistory();
}
function afterHistory() {
  if (state.selection && !findItem(state.selection)) state.selection = null;
  emit('history');
  changed();
  emit('select');
}
export function resetHistory() { undoStack.length = 0; redoStack.length = 0; emit('history'); }

// Notifica cambios en el proyecto. `live` = cambio intermedio (arrastre), sin limpieza.
export function changed(opts = {}) {
  if (!opts.live) tidy();
  state.saveState = 'dirty';
  emit('project', opts);
}

export function tidy() {
  const p = state.project;
  p.tracks = p.tracks.filter((t) => t.items.length > 0);
  for (const t of p.tracks) t.items.sort((a, b) => a.start - b.start);
  // subtítulos siempre arriba, audio siempre abajo
  const sub = p.tracks.filter((t) => t.kind === 'subtitle');
  const vis = p.tracks.filter((t) => t.kind === 'visual');
  const aud = p.tracks.filter((t) => t.kind === 'audio');
  p.tracks = [...sub, ...vis, ...aud];
}

// ---------- consultas ----------
export function allItems(p = state.project) {
  const out = [];
  for (const t of p.tracks) for (const i of t.items) out.push(i);
  return out;
}
export function findItem(id, p = state.project) {
  if (!p) return null;
  for (const t of p.tracks) {
    const i = t.items.find((x) => x.id === id);
    if (i) return { item: i, track: t };
  }
  return null;
}
export function selectedItem() { return state.selection ? findItem(state.selection)?.item || null : null; }
export function projectDuration(p = state.project) {
  let d = 0;
  for (const t of p.tracks) for (const i of t.items) d = Math.max(d, i.start + i.duration);
  return d;
}
export const trackKindFor = (type) => (type === 'audio' ? 'audio' : type === 'subtitle' ? 'subtitle' : 'visual');
export const isActive = (item, t) => t >= item.start && t < item.start + item.duration;

export function select(id) {
  if (state.selection === id) return;
  state.selection = id;
  emit('select');
}

export function setTime(t, opts = {}) {
  const d = projectDuration();
  state.time = Math.max(0, Math.min(t, Math.max(d, 0)));
  emit('time', opts);
}

// ---------- creación de items ----------
const baseItem = () => ({
  id: uid('it'), start: 0, duration: 5, x: 0, y: 0, w: 400, h: 300, rotation: 0, opacity: 1,
  flipH: false, flipV: false, radius: 0, crop: { l: 0, t: 0, r: 0, b: 0 },
  filters: { brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, grayscale: 0, sepia: 0, invert: 0 },
  filterPreset: 'none',
  anim: { in: 'none', out: 'none', inDur: 0.6, outDur: 0.6, motion: 'none' },
  speed: 1, volume: 1, muted: false, fadeIn: 0, fadeOut: 0, trimStart: 0,
});

export function fitRect(mw, mh, mode = 'contain') {
  const { width: W, height: H } = state.project;
  const s = mode === 'cover' ? Math.max(W / mw, H / mh) : Math.min(W / mw, H / mh);
  return { w: mw * s, h: mh * s, x: W / 2, y: H / 2 };
}

export function makeMediaItem(media, extra = {}) {
  const it = baseItem();
  it.type = media.type;
  it.mediaId = media.id;
  it.name = media.name;
  if (media.type === 'video' || media.type === 'image') {
    Object.assign(it, fitRect(media.width || 1280, media.height || 720, 'contain'));
  }
  if (media.type === 'video' || media.type === 'audio') it.duration = Math.max(0.1, media.duration || 5);
  if (media.type === 'image') it.duration = 5;
  return Object.assign(it, extra);
}

export function defaultText(extra = {}) {
  const { width: W, height: H } = state.project;
  const it = baseItem();
  Object.assign(it, {
    type: 'text', name: 'Texto', text: 'Escribe tu texto', x: W / 2, y: H / 2, w: Math.round(W * 0.7), h: 120,
    font: 'Montserrat', size: Math.round(Math.min(W, H) * 0.08), color: '#FFFFFF', bold: true, italic: false, underline: false,
    align: 'center', letterSpacing: 0, lineHeight: 1.2, uppercase: false,
    bg: { color: '#000000', opacity: 0, padding: 24, radius: 16 },
    stroke: { color: '#000000', width: 0 },
    shadow: { color: '#000000', opacity: 0, blur: 12, x: 0, y: 4 },
    anim: { in: 'fade', out: 'fade', inDur: 0.5, outDur: 0.5, motion: 'none' },
  });
  return Object.assign(it, extra);
}

export function defaultShape(shape, extra = {}) {
  const { width: W, height: H } = state.project;
  const it = baseItem();
  const s = Math.round(Math.min(W, H) * 0.3);
  Object.assign(it, {
    type: 'shape', name: 'Forma', shape, x: W / 2, y: H / 2, w: s, h: s,
    fill: '#FF5F3A', strokeColor: '#FFFFFF', strokeWidth: 0, progress: false,
  });
  if (shape === 'line') { it.w = Math.round(W * 0.4); it.h = 12; it.fill = '#FFFFFF'; }
  if (shape === 'arrow') { it.w = Math.round(s * 1.4); it.h = Math.round(s * 0.6); }
  if (shape === 'progress') { it.w = W; it.h = Math.round(H * 0.012) + 4; it.y = H - it.h / 2; it.fill = '#FF5F3A'; }
  return Object.assign(it, extra);
}

export function defaultSubtitle(text, start, duration) {
  const it = baseItem();
  Object.assign(it, { type: 'subtitle', name: 'Subtítulo', text, start, duration });
  delete it.crop; delete it.filters;
  return it;
}

// ---------- colocación en la línea de tiempo ----------
function overlaps(track, item, ignoreId) {
  return track.items.some((o) => o.id !== ignoreId && o.id !== item.id && item.start < o.start + o.duration - 1e-4 && o.start < item.start + item.duration - 1e-4);
}
export { overlaps as trackOverlaps };

export function newTrack(kind) {
  return { id: uid('tr'), kind, items: [], hidden: false, muted: false };
}

export function insertTrack(track, index) {
  const p = state.project;
  if (index == null) {
    if (track.kind === 'audio') p.tracks.push(track);
    else if (track.kind === 'subtitle') p.tracks.unshift(track);
    else {
      const firstVis = p.tracks.findIndex((t) => t.kind !== 'subtitle');
      p.tracks.splice(firstVis < 0 ? p.tracks.length : firstVis, 0, track);
    }
  } else p.tracks.splice(index, 0, track);
  return track;
}

// Coloca un item: en la pista indicada si no se solapa; si no, en otra libre o en una nueva.
export function placeItem(item, { trackId, preferNew = false } = {}) {
  const p = state.project;
  const kind = trackKindFor(item.type);
  if (trackId) {
    const t = p.tracks.find((x) => x.id === trackId);
    if (t && t.kind === kind && !overlaps(t, item)) { t.items.push(item); return t; }
    if (t && t.kind === kind) {
      const nt = newTrack(kind);
      insertTrack(nt, p.tracks.indexOf(t));
      nt.items.push(item);
      return nt;
    }
  }
  if (!preferNew) {
    const candidates = p.tracks.filter((t) => t.kind === kind);
    const ordered = kind === 'visual' ? [...candidates].reverse() : candidates;
    for (const t of ordered) if (!overlaps(t, item)) { t.items.push(item); return t; }
  }
  const nt = insertTrack(newTrack(kind));
  nt.items.push(item);
  return nt;
}

// Añade video/imagen al final de la pista principal (la visual más baja).
export function appendToMain(item) {
  const p = state.project;
  const vis = p.tracks.filter((t) => t.kind === 'visual');
  const main = vis[vis.length - 1];
  if (!main) { item.start = 0; return placeItem(item); }
  item.start = main.items.reduce((m, i) => Math.max(m, i.start + i.duration), 0);
  main.items.push(item);
  return main;
}

export function splitItem(item, t) {
  if (!(t > item.start + 0.05 && t < item.start + item.duration - 0.05)) return null;
  const found = findItem(item.id);
  if (!found) return null;
  const b = JSON.parse(JSON.stringify(item));
  b.id = uid('it');
  const cut = t - item.start;
  b.start = t;
  b.duration = item.duration - cut;
  b.trimStart = (item.trimStart || 0) + cut * (item.speed || 1);
  item.duration = cut;
  item.anim = { ...item.anim, out: 'none' };
  b.anim = { ...b.anim, in: 'none' };
  item.fadeOut = 0;
  b.fadeIn = 0;
  found.track.items.push(b);
  return b;
}

export function removeItem(id) {
  for (const t of state.project.tracks) {
    const i = t.items.findIndex((x) => x.id === id);
    if (i >= 0) { t.items.splice(i, 1); return true; }
  }
  return false;
}

export function duplicateItem(item) {
  const c = JSON.parse(JSON.stringify(item));
  c.id = uid('it');
  c.start = item.start + item.duration;
  const found = findItem(item.id);
  placeItem(c, { trackId: found?.track.id });
  return c;
}

export function mediaMaxDuration(item) {
  if (item.type !== 'video' && item.type !== 'audio') return Infinity;
  const m = state.media.get(item.mediaId);
  if (!m?.duration) return Infinity;
  return Math.max(0.1, (m.duration - (item.trimStart || 0)) / (item.speed || 1));
}

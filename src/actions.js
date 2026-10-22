// Acciones de edición reutilizables (barra de herramientas, atajos, menús).
import {
  state, checkpoint, changed, select, findItem, selectedItem, splitItem, removeItem, duplicateItem,
  makeMediaItem, placeItem, appendToMain, uid, setTime, projectDuration, allItems,
} from './state.js';
import { toast } from './ui.js';

export function addMediaToTimeline(media, { at, trackId, append } = {}) {
  checkpoint();
  const it = makeMediaItem(media);
  if ((media.type === 'video' || media.type === 'image') && append !== false && at == null && !trackId) {
    appendToMain(it);
  } else {
    it.start = Math.max(0, at ?? state.time);
    placeItem(it, { trackId });
  }
  changed();
  select(it.id);
  return it;
}

export function addItem(item, { at, trackId, preferNew = true } = {}) {
  checkpoint();
  item.start = Math.max(0, at ?? state.time);
  placeItem(item, { trackId, preferNew });
  changed();
  select(item.id);
  return item;
}

export function splitAtPlayhead() {
  const t = state.time;
  let targets = [];
  const sel = selectedItem();
  if (sel && t > sel.start && t < sel.start + sel.duration) targets = [sel];
  else targets = allItems().filter((i) => t > i.start + 0.05 && t < i.start + i.duration - 0.05);
  if (!targets.length) { toast('Coloca el cabezal sobre un clip para dividirlo', 'info'); return; }
  checkpoint();
  let last = null;
  for (const it of targets) last = splitItem(it, t) || last;
  changed();
  if (last && sel) select(last.id);
}

export function deleteSelected() {
  const it = selectedItem();
  if (!it) return;
  checkpoint();
  removeItem(it.id);
  select(null);
  changed();
}

export function rippleDeleteSelected() {
  const found = state.selection && findItem(state.selection);
  if (!found) return;
  checkpoint();
  const { item, track } = found;
  const gapStart = item.start, len = item.duration;
  removeItem(item.id);
  for (const o of track.items) if (o.start >= gapStart) o.start = Math.max(0, o.start - len);
  select(null);
  changed();
}

export function duplicateSelected() {
  const it = selectedItem();
  if (!it) return;
  checkpoint();
  const c = duplicateItem(it);
  changed();
  select(c.id);
}

export function copySelected() {
  const it = selectedItem();
  if (!it) return false;
  state.clipboard = JSON.parse(JSON.stringify(it));
  toast('Copiado', 'info', 1200);
  return true;
}

export function pasteClipboard() {
  if (!state.clipboard) return;
  const c = JSON.parse(JSON.stringify(state.clipboard));
  c.id = uid('it');
  addItem(c, { at: state.time, preferNew: false });
}

export function detachAudio(item) {
  const m = state.media.get(item.mediaId);
  if (!item || item.type !== 'video' || !m?.hasAudio) { toast('Este video no tiene audio', 'info'); return; }
  checkpoint();
  const a = {
    ...JSON.parse(JSON.stringify(item)), id: uid('it'), type: 'audio', name: `Audio · ${item.name || m.name}`,
  };
  item.muted = true;
  placeItem(a, {});
  changed();
  select(a.id);
  toast('Audio separado en una pista nueva', 'success');
}

export function nudgeSelected(dx, dy) {
  const it = selectedItem();
  if (!it || it.type === 'audio' || it.type === 'subtitle') return false;
  checkpoint();
  it.x += dx; it.y += dy;
  changed({ source: 'nudge' });
  return true;
}

export function stepFrame(dir) {
  const fps = state.project.fps || 30;
  setTime(Math.round((state.time + dir / fps) * fps) / fps);
}

export function jumpToEdge(end) {
  setTime(end ? projectDuration() : 0);
}

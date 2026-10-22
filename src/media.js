// Biblioteca multimedia: importación, metadatos, miniaturas, forma de onda y persistencia.
import { state, uid, emit } from './state.js';
import { putMedia, deleteMedia, getAllMedia } from './storage.js';
import { decodeMedia, computePeaks, forgetDecoded } from './audio.js';
import { toast } from './ui.js';

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|avi|3gp|ogv|wmv|flv|mpeg|mpg|ts)$/i;
const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|weba|wma)$/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic)$/i;

export function guessType(file) {
  const t = file.type || '';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('audio/')) return 'audio';
  if (t.startsWith('image/')) return 'image';
  const n = file.name || '';
  if (VIDEO_EXT.test(n)) return 'video';
  if (AUDIO_EXT.test(n)) return 'audio';
  if (IMAGE_EXT.test(n)) return 'image';
  return null;
}

function waitEvent(el, ok, bad = 'error', ms = 20000) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => { cleanup(); rej(new Error('timeout')); }, ms);
    const a = () => { cleanup(); res(); };
    const b = () => { cleanup(); rej(new Error('media-error')); };
    const cleanup = () => { clearTimeout(t); el.removeEventListener(ok, a); el.removeEventListener(bad, b); };
    el.addEventListener(ok, a, { once: true });
    el.addEventListener(bad, b, { once: true });
  });
}

async function probeVideo(url) {
  const v = document.createElement('video');
  v.preload = 'auto'; v.muted = true; v.playsInline = true; v.src = url;
  await waitEvent(v, 'loadedmetadata');
  let duration = v.duration;
  if (!isFinite(duration)) { // WebM grabados sin duración
    v.currentTime = 1e7;
    await waitEvent(v, 'seeked').catch(() => {});
    duration = v.duration;
    v.currentTime = 0;
  }
  if (!v.videoWidth) throw new Error('no-video-track');
  return { v, duration, width: v.videoWidth, height: v.videoHeight };
}

async function videoThumbs(v, duration, n = 10) {
  const thumbs = [];
  const H = 72;
  const W = Math.max(24, Math.round(H * (v.videoWidth / v.videoHeight)));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  for (let i = 0; i < n; i++) {
    const t = Math.min(duration - 0.05, ((i + 0.5) * duration) / n);
    try {
      v.currentTime = Math.max(0, t);
      await waitEvent(v, 'seeked', 'error', 5000);
      ctx.drawImage(v, 0, 0, W, H);
      thumbs.push(c.toDataURL('image/jpeg', 0.6));
    } catch { if (thumbs.length) thumbs.push(thumbs[thumbs.length - 1]); }
  }
  return thumbs;
}

async function imageInfo(url) {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  const H = 120;
  const W = Math.max(24, Math.round(H * (img.naturalWidth / img.naturalHeight)));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  c.getContext('2d').drawImage(img, 0, 0, W, H);
  return { width: img.naturalWidth || 1000, height: img.naturalHeight || 1000, thumbs: [c.toDataURL('image/jpeg', 0.7)] };
}

async function transcodeToMp4(file, onProgress) {
  const { getFFmpeg } = await import('./ffmpeg.js');
  const ff = await getFFmpeg();
  const { fetchFile } = await import('@ffmpeg/util');
  const inName = 'in_' + (file.name || 'video').replace(/[^\w.]/g, '_');
  await ff.writeFile(inName, await fetchFile(file));
  const prog = ({ progress }) => onProgress?.(progress);
  ff.on('progress', prog);
  try {
    await ff.exec(['-i', inName, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', 'out.mp4']);
    const data = await ff.readFile('out.mp4');
    return new File([data.buffer], (file.name || 'video').replace(/\.\w+$/, '') + '.mp4', { type: 'video/mp4' });
  } finally {
    ff.off('progress', prog);
    ff.deleteFile(inName).catch(() => {});
    ff.deleteFile('out.mp4').catch(() => {});
  }
}

async function finalize(rec, { persist = true } = {}) {
  const m = { ...rec, url: URL.createObjectURL(rec.blob) };
  state.media.set(m.id, m);
  if (persist) await putMedia(m.id, rec);
  emit('media');
  return m;
}

export async function importFile(file, opts = {}) {
  const type = opts.type || guessType(file);
  if (!type) throw new Error(`Formato no soportado: ${file.name}`);
  const rec = { id: uid('m'), type, name: opts.name || file.name || type, blob: file, size: file.size, source: opts.source || 'upload', added: Date.now() };
  const url = URL.createObjectURL(file);
  try {
    if (type === 'video') {
      let info;
      try {
        info = await probeVideo(url);
      } catch (e) {
        if (opts.noTranscode) throw e;
        toast('Este formato no se reproduce en el navegador. Convirtiendo a MP4…', 'info', 6000);
        const conv = await transcodeToMp4(file, opts.onProgress);
        return importFile(conv, { ...opts, name: rec.name, noTranscode: true });
      }
      rec.duration = info.duration; rec.width = info.width; rec.height = info.height;
      rec.thumbs = await videoThumbs(info.v, info.duration, Math.min(12, Math.max(4, Math.ceil(info.duration / 3))));
      info.v.removeAttribute('src'); info.v.load();
      const buf = await decodeMedia(rec);
      rec.hasAudio = !!buf;
      if (buf) rec.peaks = computePeaks(buf);
    } else if (type === 'image') {
      Object.assign(rec, await imageInfo(url));
    } else if (type === 'audio') {
      const buf = await decodeMedia(rec);
      if (!buf) throw new Error('No se pudo leer el audio');
      rec.duration = buf.duration;
      rec.peaks = computePeaks(buf);
      rec.hasAudio = true;
    }
  } finally {
    URL.revokeObjectURL(url);
  }
  return finalize(rec);
}

export async function importFiles(files) {
  const list = [...files];
  const out = [];
  for (const f of list) {
    try {
      out.push(await importFile(f));
    } catch (e) {
      console.error(e);
      toast(`No se pudo importar "${f.name}"`, 'error');
    }
  }
  if (out.length) toast(out.length === 1 ? `"${out[0].name}" añadido a tus archivos` : `${out.length} archivos añadidos`, 'success');
  return out;
}

// Descarga un recurso remoto (stock / IA) usando el proxy del servidor.
export async function fetchRemote(url, { name, type, source = 'stock', onProgress } = {}) {
  const tries = [`/api/media?url=${encodeURIComponent(url)}`, url];
  let lastErr;
  for (const u of tries) {
    try {
      const r = await fetch(u);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const total = +r.headers.get('content-length') || 0;
      let blob;
      if (r.body && onProgress && total) {
        const reader = r.body.getReader();
        const chunks = [];
        let got = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value); got += value.length;
          onProgress(got / total);
        }
        blob = new Blob(chunks, { type: r.headers.get('content-type') || '' });
      } else blob = await r.blob();
      const ext = { video: 'mp4', image: 'jpg', audio: 'mp3' }[type] || 'bin';
      const file = new File([blob], name ? `${name}.${ext}` : `recurso.${ext}`, { type: blob.type || (type === 'video' ? 'video/mp4' : type === 'audio' ? 'audio/mpeg' : 'image/jpeg') });
      return importFile(file, { type, name, source });
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('No se pudo descargar');
}

export async function removeMedia(id) {
  const m = state.media.get(id);
  if (!m) return;
  URL.revokeObjectURL(m.url);
  state.media.delete(id);
  forgetDecoded(id);
  await deleteMedia(id);
  emit('media');
}

export async function restoreMedia() {
  const recs = await getAllMedia();
  for (const rec of recs || []) {
    if (!rec?.id || !rec.blob) continue;
    state.media.set(rec.id, { ...rec, url: URL.createObjectURL(rec.blob) });
  }
  emit('media');
}

export async function renameMedia(id, name) {
  const m = state.media.get(id);
  if (!m) return;
  m.name = name;
  const { url, ...rec } = m;
  await putMedia(id, rec);
  emit('media');
}

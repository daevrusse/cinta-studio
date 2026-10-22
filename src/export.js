// Exportación a MP4: fotograma a fotograma con WebCodecs + mp4-muxer.
// Respaldo con ffmpeg.wasm cuando el navegador no tiene codificadores (o no tiene AAC).
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { state, projectDuration } from './state.js';
import { drawFrame, ensureFonts } from './renderer.js';
import { getImage } from './player.js';
import { mixAudio, audioBufferToWav } from './audio.js';

const even = (n) => Math.max(2, Math.round(n / 2) * 2);

export function outputSize(project, shortSide) {
  const { width: W, height: H } = project;
  const k = shortSide / Math.min(W, H);
  return { width: even(W * k), height: even(H * k) };
}

async function pickVideoCodec(width, height, fps, bitrate) {
  if (typeof VideoEncoder === 'undefined') return null;
  const area = width * height;
  const avc = area > 2228224 ? ['avc1.640033', 'avc1.640034'] : area > 921600 ? ['avc1.640028', 'avc1.640032', 'avc1.4d0028'] : ['avc1.64001f', 'avc1.640028', 'avc1.42001f'];
  const candidates = [
    ...avc.map((c) => ({ codec: c, mux: 'avc' })),
    { codec: 'vp09.00.40.08', mux: 'vp9' },
    { codec: 'av01.0.08M.08', mux: 'av1' },
  ];
  for (const c of candidates) {
    for (const hw of ['prefer-hardware', 'no-preference', 'prefer-software']) {
      const config = { codec: c.codec, width, height, bitrate, framerate: fps, hardwareAcceleration: hw, ...(c.mux === 'avc' ? { avc: { format: 'avc' } } : {}) };
      try {
        const s = await VideoEncoder.isConfigSupported(config);
        if (s.supported) return { config: s.config, mux: c.mux };
      } catch { /* siguiente */ }
    }
  }
  return null;
}

async function pickAudioCodec(sampleRate, channels, allowOpus) {
  if (typeof AudioEncoder === 'undefined') return null;
  const list = [{ codec: 'mp4a.40.2', mux: 'aac' }, ...(allowOpus ? [{ codec: 'opus', mux: 'opus' }] : [])];
  for (const c of list) {
    try {
      const s = await AudioEncoder.isConfigSupported({ codec: c.codec, sampleRate, numberOfChannels: channels, bitrate: 192000 });
      if (s.supported) return { config: s.config, mux: c.mux };
    } catch { /* siguiente */ }
  }
  return null;
}

async function ffmpegAvailable() {
  try { const { getFFmpeg } = await import('./ffmpeg.js'); await getFFmpeg(); return true; } catch { return false; }
}

function waitSeek(v, t) {
  return new Promise((res) => {
    if (Math.abs(v.currentTime - t) < 0.0005 && v.readyState >= 2) return res();
    const done = () => { clearTimeout(to); v.removeEventListener('seeked', done); res(); };
    const to = setTimeout(done, 4000);
    v.addEventListener('seeked', done);
    v.currentTime = t;
  });
}

async function prepareVideos(project) {
  const map = new Map();
  const loads = [];
  for (const tr of project.tracks) {
    if (tr.kind !== 'visual') continue;
    for (const it of tr.items) {
      if (it.type !== 'video') continue;
      const m = state.media.get(it.mediaId);
      if (!m) continue;
      const v = document.createElement('video');
      v.muted = true; v.preload = 'auto'; v.playsInline = true; v.src = m.url;
      map.set(it.id, v);
      loads.push(new Promise((res) => {
        if (v.readyState >= 2) return res();
        v.addEventListener('loadeddata', res, { once: true });
        v.addEventListener('error', res, { once: true });
        setTimeout(res, 15000);
      }));
    }
  }
  // fondo desenfocado puede usar videos de pistas ocultas? no: solo visibles
  await Promise.all(loads);
  return map;
}

async function preloadImages(project) {
  const ids = new Set();
  for (const tr of project.tracks) for (const it of tr.items) if (it.type === 'image') ids.add(it.mediaId);
  await Promise.all([...ids].map((id) => new Promise((res) => {
    const img = getImage(id);
    if (img) return res();
    const m = state.media.get(id);
    if (!m) return res();
    const i = new Image(); i.onload = res; i.onerror = res; i.src = m.url;
    setTimeout(res, 8000);
  })));
  // segunda pasada para asegurar que la caché del reproductor esté lista
  await new Promise((r) => setTimeout(r, 50));
}

async function seekAll(project, videos, t) {
  const waits = [];
  for (const tr of project.tracks) {
    if (tr.kind !== 'visual' || tr.hidden) continue;
    for (const it of tr.items) {
      if (it.type !== 'video') continue;
      if (!(t >= it.start && t < it.start + it.duration)) continue;
      const v = videos.get(it.id);
      if (!v) continue;
      const dur = isFinite(v.duration) ? v.duration : Infinity;
      const src = Math.min(Math.max(0, (it.trimStart || 0) + (t - it.start) * (it.speed || 1)), dur - 0.001);
      waits.push(waitSeek(v, src));
    }
  }
  await Promise.all(waits);
}

export async function exportVideo({ shortSide = 1080, fps = 30, quality = 'high', onProgress = () => {}, onStage = () => {}, signal }) {
  const project = JSON.parse(JSON.stringify(state.project));
  const duration = projectDuration(project);
  if (duration <= 0) throw new Error('El proyecto está vacío');
  const { width, height } = outputSize(project, shortSide);
  const bpp = { low: 0.06, medium: 0.1, high: 0.16 }[quality] || 0.1;
  const bitrate = Math.round(Math.min(60_000_000, Math.max(1_000_000, width * height * fps * bpp)));
  const totalFrames = Math.max(1, Math.ceil(duration * fps));
  const check = () => { if (signal?.aborted) throw new DOMException('Exportación cancelada', 'AbortError'); };

  onStage('Preparando fuentes y medios…');
  await ensureFonts(project);
  const videos = await prepareVideos(project);
  await preloadImages(project);
  const src = {
    video: (it) => { const v = videos.get(it.id); return v && v.videoWidth ? v : null; },
    image: (id) => getImage(id),
  };
  check();

  onStage('Mezclando audio…');
  const sampleRate = 48000;
  const audioBuf = await mixAudio(project, sampleRate, duration, 2);
  check();

  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false });
  const scale = width / project.width;

  const vcodec = await pickVideoCodec(width, height, fps, bitrate);
  let acodec = audioBuf ? await pickAudioCodec(sampleRate, 2, false) : null;
  // Sin AAC nativo: se intenta ffmpeg para el audio; si no está disponible, Opus dentro del MP4.
  if (audioBuf && !acodec && vcodec) {
    onStage('Preparando codificador de audio…');
    if (!(await ffmpegAvailable())) acodec = await pickAudioCodec(sampleRate, 2, true);
  }

  try {
    if (vcodec) return await encodeWebCodecs({ project, videos, src, canvas, ctx, scale, width, height, fps, bitrate, totalFrames, audioBuf, vcodec, acodec, onProgress, onStage, check });
    return await encodeFFmpeg({ project, videos, src, canvas, ctx, scale, fps, totalFrames, audioBuf, quality, onProgress, onStage, check });
  } finally {
    for (const v of videos.values()) { v.removeAttribute('src'); v.load(); }
  }
}

async function encodeWebCodecs(o) {
  const { project, videos, src, canvas, ctx, scale, width, height, fps, totalFrames, audioBuf, vcodec, acodec, onProgress, onStage, check } = o;
  const needsFfmpegAudio = audioBuf && !acodec;
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: vcodec.mux, width, height, frameRate: fps },
    ...(audioBuf && acodec ? { audio: { codec: acodec.mux, sampleRate: audioBuf.sampleRate, numberOfChannels: 2 } } : {}),
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  let encErr = null;
  const venc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { encErr = e; } });
  venc.configure(vcodec.config);

  // Audio primero (rápido)
  if (audioBuf && acodec) {
    onStage('Codificando audio…');
    const aenc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => { encErr = e; } });
    aenc.configure(acodec.config);
    const sr = audioBuf.sampleRate;
    const L = audioBuf.getChannelData(0);
    const R = audioBuf.numberOfChannels > 1 ? audioBuf.getChannelData(1) : L;
    const block = 4096;
    for (let i = 0; i < audioBuf.length; i += block) {
      const n = Math.min(block, audioBuf.length - i);
      const data = new Float32Array(n * 2);
      data.set(L.subarray(i, i + n), 0);
      data.set(R.subarray(i, i + n), n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / sr) * 1e6), data });
      aenc.encode(ad);
      ad.close();
      if (aenc.encodeQueueSize > 50) await new Promise((r) => setTimeout(r, 0));
    }
    await aenc.flush();
    aenc.close();
  }

  onStage('Renderizando video…');
  const frameDur = 1e6 / fps;
  const gop = fps * 2;
  const t0 = performance.now();
  for (let f = 0; f < totalFrames; f++) {
    check();
    if (encErr) throw encErr;
    const t = f / fps;
    await seekAll(project, videos, t);
    drawFrame(ctx, project, t, src, scale);
    const frame = new VideoFrame(canvas, { timestamp: Math.round(f * frameDur), duration: Math.round(frameDur) });
    venc.encode(frame, { keyFrame: f % gop === 0 });
    frame.close();
    while (venc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 2));
    const p = (f + 1) / totalFrames;
    const el = (performance.now() - t0) / 1000;
    onProgress(p * (needsFfmpegAudio ? 0.85 : 0.98), p > 0.02 ? (el / p) * (1 - p) : null);
  }
  await venc.flush();
  venc.close();
  if (encErr) throw encErr;
  muxer.finalize();
  let blob = new Blob([target.buffer], { type: 'video/mp4' });

  if (needsFfmpegAudio) {
    onStage('Añadiendo audio (ffmpeg)…');
    const { getFFmpeg } = await import('./ffmpeg.js');
    const ff = await getFFmpeg();
    await ff.writeFile('v.mp4', new Uint8Array(await blob.arrayBuffer()));
    await ff.writeFile('a.wav', new Uint8Array(await audioBufferToWav(audioBuf).arrayBuffer()));
    await ff.exec(['-i', 'v.mp4', '-i', 'a.wav', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', 'out.mp4']);
    const data = await ff.readFile('out.mp4');
    blob = new Blob([data.buffer], { type: 'video/mp4' });
    for (const f of ['v.mp4', 'a.wav', 'out.mp4']) ff.deleteFile(f).catch(() => {});
  }
  onProgress(1, 0);
  return { blob, width, height, codec: vcodec.mux };
}

async function encodeFFmpeg(o) {
  const { project, videos, src, canvas, ctx, scale, fps, totalFrames, audioBuf, quality, onProgress, onStage, check } = o;
  onStage('Cargando ffmpeg (solo la primera vez)…');
  const { getFFmpeg } = await import('./ffmpeg.js');
  const ff = await getFFmpeg();
  onStage('Renderizando fotogramas…');
  for (let f = 0; f < totalFrames; f++) {
    check();
    const t = f / fps;
    await seekAll(project, videos, t);
    drawFrame(ctx, project, t, src, scale);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
    await ff.writeFile(`f${String(f).padStart(6, '0')}.jpg`, new Uint8Array(await blob.arrayBuffer()));
    onProgress(((f + 1) / totalFrames) * 0.6, null);
  }
  const args = ['-framerate', String(fps), '-i', 'f%06d.jpg'];
  if (audioBuf) {
    await ff.writeFile('a.wav', new Uint8Array(await audioBufferToWav(audioBuf).arrayBuffer()));
    args.push('-i', 'a.wav');
  }
  const crf = { low: '28', medium: '23', high: '19' }[quality] || '23';
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', crf, '-pix_fmt', 'yuv420p');
  if (audioBuf) args.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
  args.push('-movflags', '+faststart', 'out.mp4');
  onStage('Codificando MP4 con ffmpeg…');
  const prog = ({ progress }) => onProgress(0.6 + Math.max(0, Math.min(1, progress)) * 0.4, null);
  ff.on('progress', prog);
  try { await ff.exec(args); } finally { ff.off('progress', prog); }
  const data = await ff.readFile('out.mp4');
  for (let f = 0; f < totalFrames; f++) ff.deleteFile(`f${String(f).padStart(6, '0')}.jpg`).catch(() => {});
  ff.deleteFile('out.mp4').catch(() => {});
  if (audioBuf) ff.deleteFile('a.wav').catch(() => {});
  onProgress(1, 0);
  return { blob: new Blob([data.buffer], { type: 'video/mp4' }), width: canvas.width, height: canvas.height, codec: 'h264' };
}

export async function exportAudioOnly() {
  const project = state.project;
  const duration = projectDuration(project);
  const buf = await mixAudio(project, 48000, duration, 2);
  if (!buf) throw new Error('El proyecto no tiene audio');
  return audioBufferToWav(buf);
}

export async function snapshotPNG(t = state.time, shortSide = 1080) {
  const project = state.project;
  const { width, height } = outputSize(project, shortSide);
  await ensureFonts(project);
  const videos = await prepareVideos(project);
  await preloadImages(project);
  await seekAll(project, videos, t);
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  drawFrame(c.getContext('2d'), project, t, { video: (it) => { const v = videos.get(it.id); return v?.videoWidth ? v : null; }, image: (id) => getImage(id) }, width / project.width);
  for (const v of videos.values()) { v.removeAttribute('src'); v.load(); }
  return new Promise((r) => c.toBlob(r, 'image/png'));
}

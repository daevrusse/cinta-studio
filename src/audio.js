// Audio: decodificación con caché, mezcla de la línea de tiempo y WAV.
import { state } from './state.js';

const decoded = new Map(); // `${mediaId}@${rate}` -> Promise<AudioBuffer|null>

export function decodeMedia(media, sampleRate = 48000) {
  const key = `${media.id}@${sampleRate}`;
  if (!decoded.has(key)) {
    decoded.set(key, (async () => {
      try {
        const ab = await media.blob.arrayBuffer();
        const ctx = new OfflineAudioContext(2, 1, sampleRate);
        return await ctx.decodeAudioData(ab);
      } catch {
        return null;
      }
    })());
  }
  return decoded.get(key);
}
export function forgetDecoded(mediaId) {
  for (const k of [...decoded.keys()]) if (k.startsWith(mediaId + '@')) decoded.delete(k);
}

// Elementos con audio audibles en la mezcla final.
export function audibleItems(project) {
  const out = [];
  for (const t of project.tracks) {
    if (t.muted || t.hidden) continue;
    for (const it of t.items) {
      if (it.type !== 'video' && it.type !== 'audio') continue;
      if (it.muted || !(it.volume > 0)) continue;
      const m = state.media.get(it.mediaId);
      if (!m || (it.type === 'video' && m.hasAudio === false)) continue;
      out.push({ it, m });
    }
  }
  return out;
}

// Renderiza la mezcla de audio de todo el proyecto.
export async function mixAudio(project, sampleRate, duration, channels = 2) {
  const items = audibleItems(project);
  if (!items.length || duration <= 0) return null;
  const length = Math.max(1, Math.ceil(duration * sampleRate));
  const ctx = new OfflineAudioContext(channels, length, sampleRate);
  const master = ctx.createGain();
  master.gain.value = project.masterVolume ?? 1;
  master.connect(ctx.destination);
  let any = false;
  for (const { it, m } of items) {
    const buf = await decodeMedia(m, sampleRate);
    if (!buf) continue;
    any = true;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const speed = it.speed || 1;
    src.playbackRate.value = speed;
    const g = ctx.createGain();
    const vol = it.volume ?? 1;
    const start = it.start;
    const end = it.start + it.duration;
    const fi = Math.min(it.fadeIn || 0, it.duration / 2);
    const fo = Math.min(it.fadeOut || 0, it.duration / 2);
    g.gain.setValueAtTime(fi > 0 ? 0 : vol, start);
    if (fi > 0) g.gain.linearRampToValueAtTime(vol, start + fi);
    if (fo > 0) {
      g.gain.setValueAtTime(vol, Math.max(start + fi, end - fo));
      g.gain.linearRampToValueAtTime(0, end);
    }
    src.connect(g).connect(master);
    const offset = Math.min(it.trimStart || 0, Math.max(0, buf.duration - 0.01));
    src.start(start, offset, it.duration * speed);
  }
  if (!any) return null;
  return ctx.startRendering();
}

export function toMono(buffer) {
  const n = buffer.length;
  const out = new Float32Array(n);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += d[i] / buffer.numberOfChannels;
  }
  return out;
}

export function encodeWav(channels, sampleRate) {
  const numCh = channels.length;
  const len = channels[0].length;
  const buf = new ArrayBuffer(44 + len * numCh * 2);
  const v = new DataView(buf);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); v.setUint32(4, 36 + len * numCh * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, numCh, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * numCh * 2, true);
  v.setUint16(32, numCh * 2, true); v.setUint16(34, 16, true); ws(36, 'data'); v.setUint32(40, len * numCh * 2, true);
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([buf], { type: 'audio/wav' });
}

export function audioBufferToWav(buffer) {
  const chans = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) chans.push(buffer.getChannelData(c));
  return encodeWav(chans, buffer.sampleRate);
}

export function computePeaks(buffer, perSecond = 40) {
  const n = Math.max(1, Math.ceil(buffer.duration * perSecond));
  const step = buffer.length / n;
  const data = toMono(buffer);
  const peaks = new Array(n);
  for (let i = 0; i < n; i++) {
    let max = 0;
    const s = Math.floor(i * step);
    const e = Math.min(data.length, Math.floor((i + 1) * step));
    for (let j = s; j < e; j += 4) { const a = Math.abs(data[j]); if (a > max) max = a; }
    peaks[i] = Math.round(Math.min(1, max) * 255);
  }
  return { perSecond, data: peaks };
}

// Efectos de sonido sintetizados (sin depender de servicios externos).
export async function synthSfx(kind) {
  const sr = 44100;
  const dur = { whoosh: 0.9, pop: 0.25, ding: 1.4, click: 0.08, swoosh: 0.6, boom: 1.6, rise: 2.0, beep: 0.5, applause: 2.5, tick: 0.05 }[kind] || 1;
  const ctx = new OfflineAudioContext(2, Math.ceil(sr * dur), sr);
  const noise = () => {
    const b = ctx.createBuffer(1, Math.ceil(sr * dur), sr);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(); s.buffer = b; return s;
  };
  const g = ctx.createGain();
  g.connect(ctx.destination);
  if (kind === 'whoosh' || kind === 'swoosh') {
    const n = noise(); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(300, 0); f.frequency.exponentialRampToValueAtTime(kind === 'whoosh' ? 3000 : 5000, dur * 0.6); f.frequency.exponentialRampToValueAtTime(600, dur);
    g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(0.9, dur * 0.45); g.gain.linearRampToValueAtTime(0, dur);
    n.connect(f).connect(g); n.start();
  } else if (kind === 'pop') {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(900, 0); o.frequency.exponentialRampToValueAtTime(120, 0.15);
    g.gain.setValueAtTime(0.9, 0); g.gain.exponentialRampToValueAtTime(0.001, dur); o.connect(g); o.start();
  } else if (kind === 'ding') {
    for (const [fr, a] of [[1318, 0.5], [2637, 0.2], [3951, 0.08]]) {
      const o = ctx.createOscillator(); o.frequency.value = fr; const og = ctx.createGain();
      og.gain.setValueAtTime(a, 0); og.gain.exponentialRampToValueAtTime(0.0001, dur); o.connect(og).connect(g); o.start();
    }
    g.gain.value = 1;
  } else if (kind === 'click' || kind === 'tick') {
    const n = noise(); const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = kind === 'tick' ? 4000 : 1500;
    g.gain.setValueAtTime(1, 0); g.gain.exponentialRampToValueAtTime(0.001, dur); n.connect(f).connect(g); n.start();
  } else if (kind === 'boom') {
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(110, 0); o.frequency.exponentialRampToValueAtTime(30, dur);
    const n = noise(); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
    g.gain.setValueAtTime(1, 0); g.gain.exponentialRampToValueAtTime(0.001, dur); o.connect(g); n.connect(f).connect(g); o.start(); n.start();
  } else if (kind === 'rise') {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(110, 0); o.frequency.exponentialRampToValueAtTime(880, dur);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(400, 0); f.frequency.exponentialRampToValueAtTime(6000, dur);
    g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(0.35, dur * 0.9); g.gain.linearRampToValueAtTime(0, dur);
    o.connect(f).connect(g); o.start();
  } else if (kind === 'beep') {
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 1000;
    g.gain.setValueAtTime(0.25, 0); g.gain.setValueAtTime(0.25, dur - 0.05); g.gain.linearRampToValueAtTime(0, dur); o.connect(g); o.start();
  } else if (kind === 'applause') {
    const n = noise(); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2500; f.Q.value = 0.6;
    const lfo = ctx.createGain(); g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(0.8, 0.3); g.gain.setValueAtTime(0.8, dur - 0.8); g.gain.linearRampToValueAtTime(0, dur);
    const b = ctx.createBuffer(1, Math.ceil(sr * dur), sr); const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() < 0.004 ? 1 : d[Math.max(0, i - 1)] * 0.985;
    const env = ctx.createBufferSource(); env.buffer = b;
    lfo.gain.value = 0; env.connect(lfo.gain); n.connect(f).connect(lfo).connect(g); n.start(); env.start();
  }
  const out = await ctx.startRendering();
  return audioBufferToWav(out);
}

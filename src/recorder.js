// Grabación con MediaRecorder (cámara, pantalla, micrófono).
export function pickMime(kind) {
  const list = kind === 'audio'
    ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
    : ['video/mp4;codecs=avc1,mp4a', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  return list.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
}

export function createRecorder(stream, kind) {
  const mimeType = pickMime(kind);
  const rec = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 8_000_000 } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise((res) => { rec.onstop = () => res(new Blob(chunks, { type: rec.mimeType || mimeType || (kind === 'audio' ? 'audio/webm' : 'video/webm') })); });
  return { rec, done, start: () => rec.start(250), stop: () => { if (rec.state !== 'inactive') rec.stop(); } };
}

export function stopStream(s) { s?.getTracks().forEach((t) => t.stop()); }

export function levelMeter(stream, el) {
  let ctx, raf;
  try {
    ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    const data = new Uint8Array(an.fftSize);
    const loop = () => {
      an.getByteTimeDomainData(data);
      let m = 0;
      for (const v of data) m = Math.max(m, Math.abs(v - 128));
      el.style.setProperty('--lvl', `${Math.min(100, (m / 128) * 180)}%`);
      raf = requestAnimationFrame(loop);
    };
    loop();
  } catch { /* sin medidor */ }
  return () => { cancelAnimationFrame(raf); ctx?.close(); };
}

export const extFor = (mime) => (mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : 'webm');

// Panel "Grabar": cámara, pantalla o pantalla + cámara.
import { h, icon, btn, toast, fmtTime } from '../ui.js';
import { importFile } from '../media.js';
import { addMediaToTimeline } from '../actions.js';
import { createRecorder, stopStream, extFor } from '../recorder.js';

export function render(root) {
  let mode = 'camera', stream, camStream, recorder, recording = false, t0, raf, composeStop;
  const video = h('video', { class: 'rec-preview', autoplay: true, muted: true, playsInline: true });
  const placeholder = h('div', { class: 'rec-placeholder' }, icon('camera', 28), h('span', null, 'Elige una fuente y pulsa "Activar"'));
  const stage = h('div', { class: 'rec-stage' }, placeholder, video);
  const timer = h('span', { class: 'rec-timer' }, '0:00.00');
  const micToggle = h('input', { type: 'checkbox', checked: true });

  const modes = h('div', { class: 'rec-modes' }, [['camera', 'camera', 'Cámara'], ['screen', 'monitor', 'Pantalla'], ['both', 'record', 'Pantalla + cámara']].map(([k, ic, l]) =>
    h('button', { type: 'button', class: `rec-mode${k === mode ? ' on' : ''}`, onclick: (e) => { if (recording) return; mode = k; modes.querySelectorAll('.on').forEach((x) => x.classList.remove('on')); e.currentTarget.classList.add('on'); release(); } }, icon(ic, 20), h('span', null, l))));

  const startBtn = btn('Activar', { icon: 'camera', cls: 'ghost full', onClick: activate });
  const recBtn = btn('Empezar a grabar', { icon: 'dot', cls: 'danger full', onClick: toggleRec, disabled: true });

  function release() {
    stopStream(stream); stopStream(camStream); composeStop?.();
    stream = camStream = null; composeStop = null;
    video.srcObject = null;
    placeholder.classList.remove('hidden');
    recBtn.disabled = true;
  }

  async function activate() {
    release();
    try {
      if (mode === 'camera') {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: micToggle.checked });
      } else {
        const scr = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
        let mic = null;
        if (micToggle.checked) { try { mic = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { /* sin mic */ } }
        if (mode === 'both') { try { camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360 } }); } catch { toast('No se pudo abrir la cámara', 'error'); } }
        stream = compose(scr, camStream, mic);
        scr.getVideoTracks()[0].addEventListener('ended', () => { if (recording) toggleRec(); release(); });
      }
      video.srcObject = stream;
      placeholder.classList.add('hidden');
      recBtn.disabled = false;
    } catch (e) {
      console.error(e);
      toast('No se otorgó el permiso o el dispositivo no está disponible', 'error');
    }
  }

  // Combina pantalla + cámara (círculo en la esquina) + audios en un solo stream.
  function compose(scr, cam, mic) {
    const sv = h('video', { muted: true, autoplay: true, playsInline: true }); sv.srcObject = scr; sv.play();
    let cv;
    if (cam) { cv = h('video', { muted: true, autoplay: true, playsInline: true }); cv.srcObject = cam; cv.play(); }
    const s = scr.getVideoTracks()[0].getSettings();
    const c = h('canvas', { width: s.width || 1920, height: s.height || 1080 });
    const ctx = c.getContext('2d');
    let on = true;
    const draw = () => {
      if (!on) return;
      if (sv.videoWidth && (c.width !== sv.videoWidth)) { c.width = sv.videoWidth; c.height = sv.videoHeight; }
      ctx.drawImage(sv, 0, 0, c.width, c.height);
      if (cv?.videoWidth) {
        const d = Math.round(c.height * 0.28), x = c.width - d - 32, y = c.height - d - 32;
        ctx.save(); ctx.beginPath(); ctx.arc(x + d / 2, y + d / 2, d / 2, 0, Math.PI * 2); ctx.clip();
        const k = Math.max(d / cv.videoWidth, d / cv.videoHeight);
        ctx.drawImage(cv, x + d / 2 - (cv.videoWidth * k) / 2, y + d / 2 - (cv.videoHeight * k) / 2, cv.videoWidth * k, cv.videoHeight * k);
        ctx.restore();
        ctx.lineWidth = 6; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(x + d / 2, y + d / 2, d / 2, 0, Math.PI * 2); ctx.stroke();
      }
      requestAnimationFrame(draw);
    };
    draw();
    const out = c.captureStream(30);
    const audios = [...scr.getAudioTracks(), ...(mic?.getAudioTracks() || [])];
    if (audios.length > 1) {
      const ac = new AudioContext();
      const dest = ac.createMediaStreamDestination();
      for (const tr of audios) ac.createMediaStreamSource(new MediaStream([tr])).connect(dest);
      out.addTrack(dest.stream.getAudioTracks()[0]);
      composeStop = () => { on = false; ac.close(); stopStream(scr); stopStream(mic); };
    } else {
      audios.forEach((t) => out.addTrack(t));
      composeStop = () => { on = false; stopStream(scr); stopStream(mic); };
    }
    return out;
  }

  async function toggleRec() {
    if (!recording) {
      recorder = createRecorder(stream, 'video');
      recorder.start();
      recording = true;
      recBtn.classList.add('recording');
      recBtn.querySelector('span').textContent = 'Detener grabación';
      t0 = performance.now();
      const loop = () => { timer.textContent = fmtTime((performance.now() - t0) / 1000); raf = requestAnimationFrame(loop); };
      loop();
    } else {
      recording = false;
      cancelAnimationFrame(raf);
      recorder.stop();
      recBtn.classList.remove('recording');
      recBtn.querySelector('span').textContent = 'Empezar a grabar';
      const blob = await recorder.done;
      try {
        const label = { camera: 'Cámara', screen: 'Pantalla', both: 'Pantalla + cámara' }[mode];
        const m = await importFile(new File([blob], `grabacion.${extFor(blob.type)}`, { type: blob.type }), { name: `${label} ${new Date().toLocaleTimeString()}`, source: 'record' });
        addMediaToTimeline(m);
        toast('Grabación añadida a la línea de tiempo', 'success');
      } catch (e) { console.error(e); toast('No se pudo procesar la grabación', 'error'); }
    }
  }

  root.append(modes, stage,
    h('div', { class: 'row between rec-bar' }, h('label', { class: 'ctl-toggle inline' }, h('span', { class: 'switch' }, micToggle, h('i')), h('span', null, 'Micrófono')), timer),
    startBtn, recBtn,
    h('p', { class: 'hint' }, 'Todo se graba en tu equipo. Al detener, el video se añade a tus archivos y a la línea de tiempo.'));
}

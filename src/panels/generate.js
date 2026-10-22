// Panel "Generar": imágenes con IA y video tipo "slideshow" generado desde un guion.
import { state, checkpoint, changed, makeMediaItem, newTrack, insertTrack, select, defaultText } from '../state.js';
import { h, icon, btn, toast, spinner, progressBar } from '../ui.js';
import { section, slider, toggle } from '../controls.js';
import { importFile } from '../media.js';
import { addMediaToTimeline } from '../actions.js';

const STYLES = {
  none: ['Libre', ''],
  photo: ['Fotorrealista', 'photorealistic, professional photography, natural light, 50mm, highly detailed'],
  cinematic: ['Cinematográfico', 'cinematic film still, dramatic lighting, shallow depth of field, color graded'],
  illustration: ['Ilustración', 'flat vector illustration, clean shapes, vibrant colors'],
  anime: ['Anime', 'anime style, studio quality, detailed background'],
  render3d: ['3D', '3d render, octane, soft studio lighting, high detail'],
  watercolor: ['Acuarela', 'watercolor painting, soft edges, paper texture'],
  product: ['Producto', 'product photography, studio background, soft shadows, commercial'],
};

function genSize() {
  const { width: W, height: H } = state.project;
  const k = 1280 / Math.max(W, H);
  return { w: Math.round((W * k) / 16) * 16, h: Math.round((H * k) / 16) * 16 };
}

function imageUrl(prompt, seed) {
  const { w, h: hh } = genSize();
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${hh}&seed=${seed}&nologo=true&enhance=true`;
}

async function fetchImage(url) {
  for (const u of [`/api/media?url=${encodeURIComponent(url)}`, url]) {
    try {
      const r = await fetch(u);
      if (!r.ok) continue;
      const b = await r.blob();
      if (b.size > 1000 && (b.type.startsWith('image/') || !b.type)) return b;
    } catch { /* siguiente */ }
  }
  throw new Error('El servicio de imágenes no respondió');
}

export function render(root) {
  let style = 'photo';
  const prompt = h('textarea', { rows: 4, placeholder: 'Describe la imagen. Ej.: "Taza de café humeante sobre una mesa de madera, luz de mañana"' });
  const styleChips = h('div', { class: 'chips small' }, Object.entries(STYLES).map(([k, [l]]) => h('button', {
    type: 'button', class: `chip${k === style ? ' on' : ''}`, onclick: (e) => { style = k; styleChips.querySelectorAll('.on').forEach((x) => x.classList.remove('on')); e.currentTarget.classList.add('on'); },
  }, l)));
  const results = h('div', { class: 'gen-grid' });
  const genBtn = btn('Generar 4 imágenes', { icon: 'sparkles', cls: 'primary full', onClick: generate });

  async function generate() {
    const p = prompt.value.trim();
    if (!p) { toast('Escribe una descripción', 'info'); return; }
    genBtn.disabled = true;
    const full = [p, STYLES[style][1]].filter(Boolean).join(', ');
    const base = Math.floor(Math.random() * 1e6);
    results.replaceChildren();
    const { w, h: hh } = genSize();
    const cards = [0, 1, 2, 3].map((i) => {
      const c = h('div', { class: 'gen-card loading', style: { aspectRatio: `${w} / ${hh}` } }, spinner(22));
      results.append(c);
      return c;
    });
    await Promise.all(cards.map(async (c, i) => {
      try {
        const blob = await fetchImage(imageUrl(full, base + i * 7919));
        const url = URL.createObjectURL(blob);
        c.classList.remove('loading');
        c.replaceChildren(h('img', { src: url, alt: p }), h('div', { class: 'gen-actions' },
          h('button', { type: 'button', class: 'btn primary sm', onclick: async (e) => {
            e.currentTarget.disabled = true;
            const m = await importFile(new File([blob], 'ia.jpg', { type: blob.type || 'image/jpeg' }), { name: `IA · ${p.slice(0, 30)}`, source: 'ai' });
            addMediaToTimeline(m);
            toast('Imagen añadida', 'success');
          } }, icon('plus', 14), h('span', null, 'Usar'))));
      } catch (e) {
        c.classList.remove('loading');
        c.classList.add('failed');
        c.replaceChildren(h('span', null, 'No disponible'));
      }
    }));
    genBtn.disabled = false;
    if (!results.querySelector('img')) toast('El generador gratuito está saturado. Intenta de nuevo en unos segundos.', 'error', 6000);
  }

  // ---- video desde guion ----
  const script = h('textarea', { rows: 6, placeholder: 'Una escena por línea:\nAmanecer sobre los Andes\nMercado lleno de frutas coloridas\nTaza de café peruano humeante' });
  const sOpts = { per: 4, captions: true, motion: true };
  const pbar = progressBar();
  const sStatus = h('div', { class: 'ai-status hidden' }, h('span'), pbar.el);
  const sBtn = btn('Crear video', { icon: 'film', cls: 'primary full', onClick: slideshow });

  async function slideshow() {
    const lines = script.value.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 20);
    if (!lines.length) { toast('Escribe al menos una escena', 'info'); return; }
    sBtn.disabled = true;
    sStatus.classList.remove('hidden');
    const label = sStatus.firstChild;
    const medias = new Array(lines.length);
    let done = 0;
    label.textContent = `Generando escenas (0/${lines.length})…`;
    pbar.set(0.02);
    const seed = Math.floor(Math.random() * 1e6);
    const work = lines.map((l, i) => async () => {
      const full = [l, STYLES[style][1]].filter(Boolean).join(', ');
      try {
        const blob = await fetchImage(imageUrl(full, seed + i));
        medias[i] = await importFile(new File([blob], `escena-${i + 1}.jpg`, { type: blob.type || 'image/jpeg' }), { name: `Escena ${i + 1} · ${l.slice(0, 24)}`, source: 'ai' });
      } catch { medias[i] = null; }
      done++;
      label.textContent = `Generando escenas (${done}/${lines.length})…`;
      pbar.set(done / lines.length);
    });
    const queue = [...work];
    await Promise.all([0, 1].map(async () => { while (queue.length) await queue.shift()(); }));
    const ok = medias.filter(Boolean).length;
    if (!ok) { toast('No se pudo generar ninguna escena. Intenta de nuevo.', 'error'); sBtn.disabled = false; sStatus.classList.add('hidden'); return; }
    checkpoint();
    const vt = insertTrack(newTrack('visual'));
    const tt = sOpts.captions ? newTrack('visual') : null;
    if (tt) insertTrack(tt, state.project.tracks.indexOf(vt));
    const motions = ['zoom-in', 'pan-right', 'zoom-out', 'pan-left'];
    let t = state.time, first;
    medias.forEach((m, i) => {
      if (!m) return;
      const it = makeMediaItem(m, { start: t, duration: sOpts.per });
      Object.assign(it, { x: state.project.width / 2, y: state.project.height / 2 });
      const s = Math.max(state.project.width / m.width, state.project.height / m.height);
      it.w = m.width * s; it.h = m.height * s;
      it.anim = { in: i === 0 ? 'fade' : 'fade', out: 'fade', inDur: 0.5, outDur: 0.5, motion: sOpts.motion ? motions[i % motions.length] : 'none' };
      vt.items.push(it);
      first ||= it;
      if (tt) {
        const tx = defaultText({ text: lines[i], start: t + 0.3, duration: Math.max(0.6, sOpts.per - 0.6), y: state.project.height * 0.82,
          size: Math.round(Math.min(state.project.width, state.project.height) * 0.055),
          bg: { color: '#000000', opacity: 0.45, padding: 22, radius: 14 }, anim: { in: 'slide-up', out: 'fade', inDur: 0.5, outDur: 0.4, motion: 'none' } });
        tt.items.push(tx);
      }
      t += sOpts.per;
    });
    changed();
    if (first) select(first.id);
    toast(`Video creado con ${ok} escenas`, 'success');
    sBtn.disabled = false;
    setTimeout(() => sStatus.classList.add('hidden'), 800);
  }

  root.append(
    section('Imagen con IA', prompt, h('label', { class: 'mini-label' }, 'Estilo'), styleChips, genBtn, results),
    section('Video desde un guion',
      h('p', { class: 'hint' }, 'Crea un video con una imagen generada por escena, movimiento de cámara y textos.'),
      script,
      slider('Segundos por escena', { min: 2, max: 10, step: 0.5, value: sOpts.per, unit: 's', onInput: (v) => { sOpts.per = v; } }),
      toggle('Añadir el texto de cada escena', sOpts.captions, (v) => { sOpts.captions = v; }),
      toggle('Movimiento de cámara (Ken Burns)', sOpts.motion, (v) => { sOpts.motion = v; }),
      sBtn, sStatus,
      h('p', { class: 'credit' }, 'Imágenes generadas con ', h('a', { href: 'https://pollinations.ai', target: '_blank', rel: 'noopener' }, 'Pollinations'), ' (servicio gratuito, puede tardar o saturarse).')));
}

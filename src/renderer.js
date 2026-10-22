// Motor de composición: dibuja un fotograma del proyecto en un canvas 2D.
// Se usa igual para la vista previa y para la exportación (resultado idéntico).

export const FILTER_PRESETS = {
  none: { label: 'Original', f: {} },
  vivid: { label: 'Vívido', f: { saturation: 150, contrast: 110 } },
  warm: { label: 'Cálido', f: { sepia: 22, saturation: 120, hue: -8, brightness: 103 } },
  cool: { label: 'Frío', f: { hue: 12, saturation: 90, brightness: 103, contrast: 105 } },
  bw: { label: 'B/N', f: { grayscale: 100, contrast: 110 } },
  noir: { label: 'Noir', f: { grayscale: 100, contrast: 165, brightness: 85 } },
  sepia: { label: 'Sepia', f: { sepia: 85, contrast: 95 } },
  vintage: { label: 'Vintage', f: { sepia: 38, contrast: 88, saturation: 78, brightness: 106 } },
  dramatic: { label: 'Dramático', f: { contrast: 145, saturation: 80, brightness: 90 } },
  faded: { label: 'Desvaído', f: { contrast: 78, saturation: 70, brightness: 112 } },
  sunset: { label: 'Atardecer', f: { sepia: 30, saturation: 140, hue: -18, contrast: 108 } },
  dream: { label: 'Sueño', f: { brightness: 112, saturation: 120, blur: 1, contrast: 92 } },
};
export const FILTER_DEFAULTS = { brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, grayscale: 0, sepia: 0, invert: 0 };

export const ANIMS = {
  none: 'Ninguna', fade: 'Desvanecer', 'slide-left': 'Deslizar ←', 'slide-right': 'Deslizar →', 'slide-up': 'Deslizar ↑',
  'slide-down': 'Deslizar ↓', 'zoom-in': 'Acercar', 'zoom-out': 'Alejar', pop: 'Pop', rotate: 'Girar', blur: 'Desenfoque',
  wipe: 'Barrido', bounce: 'Rebote', typewriter: 'Máquina de escribir',
};
export const MOTIONS = {
  none: 'Sin movimiento', 'zoom-in': 'Zoom lento (acercar)', 'zoom-out': 'Zoom lento (alejar)',
  'pan-left': 'Paneo a la izquierda', 'pan-right': 'Paneo a la derecha', 'pan-up': 'Paneo hacia arriba', 'pan-down': 'Paneo hacia abajo',
};

const easeOut = (p) => 1 - Math.pow(1 - p, 3);
const easeBack = (p) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };
const easeBounce = (x) => {
  const n1 = 7.5625, d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
};

export function hexToRgba(hex, a = 1) {
  if (!hex) return `rgba(0,0,0,${a})`;
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  const n = parseInt(c.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function filterString(f, scale = 1) {
  if (!f) return 'none';
  const parts = [];
  if (f.brightness != null && f.brightness !== 100) parts.push(`brightness(${f.brightness}%)`);
  if (f.contrast != null && f.contrast !== 100) parts.push(`contrast(${f.contrast}%)`);
  if (f.saturation != null && f.saturation !== 100) parts.push(`saturate(${f.saturation}%)`);
  if (f.hue) parts.push(`hue-rotate(${f.hue}deg)`);
  if (f.grayscale) parts.push(`grayscale(${f.grayscale}%)`);
  if (f.sepia) parts.push(`sepia(${f.sepia}%)`);
  if (f.invert) parts.push(`invert(${f.invert}%)`);
  if (f.blur) parts.push(`blur(${(f.blur * scale).toFixed(2)}px)`);
  return parts.length ? parts.join(' ') : 'none';
}

function applyAnim(type, p, s, phase, W, H) {
  p = Math.max(0, Math.min(1, p));
  const e = easeOut(p);
  switch (type) {
    case 'fade': s.alpha *= p; break;
    case 'slide-left': s.tx += -(1 - e) * W * 0.5; s.alpha *= Math.min(1, p * 1.5); break;
    case 'slide-right': s.tx += (1 - e) * W * 0.5; s.alpha *= Math.min(1, p * 1.5); break;
    case 'slide-up': s.ty += (1 - e) * H * 0.35; s.alpha *= Math.min(1, p * 1.5); break;
    case 'slide-down': s.ty -= (1 - e) * H * 0.35; s.alpha *= Math.min(1, p * 1.5); break;
    case 'zoom-in': s.sc *= 0.55 + 0.45 * e; s.alpha *= p; break;
    case 'zoom-out': s.sc *= 1.5 - 0.5 * e; s.alpha *= p; break;
    case 'pop': s.sc *= phase === 'in' ? Math.max(0, easeBack(p)) : e; s.alpha *= Math.min(1, p * 3); break;
    case 'rotate': s.rot += (1 - e) * (phase === 'in' ? -120 : 120); s.sc *= 0.4 + 0.6 * e; s.alpha *= p; break;
    case 'blur': s.blur += (1 - p) * 26; s.alpha *= p; break;
    case 'wipe': s.wipe = Math.min(s.wipe, e); break;
    case 'bounce': s.ty += -(1 - easeBounce(p)) * H * 0.35; s.alpha *= Math.min(1, p * 4); break;
    case 'typewriter': s.chars = Math.min(s.chars, phase === 'in' ? p : 1); if (phase === 'out') s.alpha *= p; break;
    default: break;
  }
}

export function animState(item, local, W, H) {
  const s = { alpha: 1, tx: 0, ty: 0, sc: 1, rot: 0, blur: 0, wipe: 1, chars: 1 };
  const a = item.anim || {};
  const d = item.duration;
  const inD = Math.min(a.inDur ?? 0.5, d / 2);
  const outD = Math.min(a.outDur ?? 0.5, d / 2);
  if (a.in && a.in !== 'none' && inD > 0 && local < inD) applyAnim(a.in, local / inD, s, 'in', W, H);
  if (a.out && a.out !== 'none' && outD > 0 && local > d - outD) applyAnim(a.out, (d - local) / outD, s, 'out', W, H);
  return s;
}

function motionState(item, local) {
  const q = Math.max(0, Math.min(1, local / Math.max(0.01, item.duration)));
  const m = item.anim?.motion || 'none';
  const k = 0.16;
  switch (m) {
    case 'zoom-in': return { ms: 1 + k * q, ox: 0, oy: 0 };
    case 'zoom-out': return { ms: 1 + k * (1 - q), ox: 0, oy: 0 };
    case 'pan-left': return { ms: 1 + k, ox: (0.5 - q) * item.w * k * 0.9, oy: 0 };
    case 'pan-right': return { ms: 1 + k, ox: (q - 0.5) * item.w * k * 0.9, oy: 0 };
    case 'pan-up': return { ms: 1 + k, ox: 0, oy: (0.5 - q) * item.h * k * 0.9 };
    case 'pan-down': return { ms: 1 + k, ox: 0, oy: (q - 0.5) * item.h * k * 0.9 };
    default: return null;
  }
}

function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r || 0, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else {
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
}

function deviceScale(ctx) {
  const m = ctx.getTransform();
  return Math.hypot(m.a, m.b) || 1;
}

// ---------- texto ----------
const metrics = new Map();
export function itemBox(item) {
  if (item.type === 'text') {
    const m = metrics.get(item.id);
    return { w: item.w, h: m?.h ?? item.size * (item.lineHeight || 1.2) };
  }
  return { w: item.w, h: item.h };
}

function fontString(it) {
  return `${it.italic ? 'italic ' : ''}${it.bold ? '700' : '400'} ${it.size}px "${it.font}", "Manrope", sans-serif`;
}

export function layoutText(ctx, it) {
  ctx.font = fontString(it);
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${it.letterSpacing || 0}px`;
  const raw = it.uppercase ? (it.text || '').toUpperCase() : it.text || '';
  const maxW = Math.max(10, it.w);
  const lines = [];
  for (const para of raw.split('\n')) {
    const words = para.split(/(\s+)/).filter((x) => x.length);
    let line = '';
    for (const w of words) {
      const test = line + w;
      if (line && ctx.measureText(test.trimEnd()).width > maxW && w.trim()) {
        lines.push(line.trimEnd());
        line = w.trimStart();
      } else line = test;
      // palabras más largas que la caja: se cortan por caracteres
      while (ctx.measureText(line).width > maxW && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > maxW) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    lines.push(line.trimEnd());
  }
  const lineH = it.size * (it.lineHeight || 1.2);
  const widths = lines.map((l) => ctx.measureText(l).width);
  return { lines, widths, lineH, height: lines.length * lineH, maxLineW: Math.max(0, ...widths) };
}

function drawTextBlock(ctx, it, chars = 1, alphaMul = 1) {
  const L = layoutText(ctx, it);
  const bg = it.bg || {};
  const pad = bg.opacity > 0 ? bg.padding || 0 : 0;
  const totalH = L.height;
  metrics.set(it.id, { h: totalH + pad * 2 });
  const align = it.align || 'center';
  const halfW = it.w / 2;
  const ds = deviceScale(ctx);

  if (bg.opacity > 0) {
    const bw = Math.min(it.w, L.maxLineW) + pad * 2;
    const bx = align === 'left' ? -halfW - pad : align === 'right' ? halfW - bw + pad : -bw / 2;
    ctx.fillStyle = hexToRgba(bg.color, bg.opacity * alphaMul);
    rr(ctx, bx, -totalH / 2 - pad, bw, totalH + pad * 2, bg.radius || 0);
    ctx.fill();
  }

  const x = align === 'left' ? -halfW : align === 'right' ? halfW : 0;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  const total = L.lines.reduce((a, l) => a + l.length, 0);
  let budget = chars >= 1 ? Infinity : Math.floor(total * chars);
  const sh = it.shadow || {};
  const st = it.stroke || {};

  L.lines.forEach((line, i) => {
    if (budget <= 0) return;
    const txt = budget === Infinity ? line : line.slice(0, budget);
    if (budget !== Infinity) budget -= line.length;
    const y = -totalH / 2 + L.lineH * (i + 0.5);
    if (st.width > 0) {
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.strokeStyle = st.color || '#000';
      ctx.lineWidth = st.width * 2;
      if (sh.opacity > 0) {
        ctx.shadowColor = hexToRgba(sh.color, sh.opacity);
        ctx.shadowBlur = (sh.blur || 0) * ds;
        ctx.shadowOffsetX = (sh.x || 0) * ds;
        ctx.shadowOffsetY = (sh.y || 0) * ds;
      }
      ctx.strokeText(txt, x, y);
      ctx.restore();
    }
    ctx.save();
    if (sh.opacity > 0 && !(st.width > 0)) {
      ctx.shadowColor = hexToRgba(sh.color, sh.opacity);
      ctx.shadowBlur = (sh.blur || 0) * ds;
      ctx.shadowOffsetX = (sh.x || 0) * ds;
      ctx.shadowOffsetY = (sh.y || 0) * ds;
    }
    ctx.fillStyle = it.color || '#fff';
    ctx.fillText(txt, x, y);
    ctx.restore();
    if (it.underline && txt) {
      const w = ctx.measureText(txt).width;
      const ux = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
      ctx.fillStyle = it.color || '#fff';
      ctx.fillRect(ux, y + it.size * 0.42, w, Math.max(2, it.size * 0.06));
    }
  });
}

// ---------- formas ----------
function shapePath(ctx, it) {
  const w = it.w, h = it.h;
  ctx.beginPath();
  switch (it.shape) {
    case 'circle': ctx.ellipse(0, 0, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2); break;
    case 'triangle': ctx.moveTo(0, -h / 2); ctx.lineTo(w / 2, h / 2); ctx.lineTo(-w / 2, h / 2); ctx.closePath(); break;
    case 'star': {
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 1 : 0.45;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const px = Math.cos(a) * (w / 2) * r, py = Math.sin(a) * (h / 2) * r + h * 0.05;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath(); break;
    }
    case 'hexagon':
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        const px = Math.cos(a) * (w / 2), py = Math.sin(a) * (h / 2);
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath(); break;
    case 'arrow': {
      const hw = Math.min(w * 0.45, h * 0.9), sh = h * 0.38;
      ctx.moveTo(-w / 2, -sh / 2); ctx.lineTo(w / 2 - hw, -sh / 2); ctx.lineTo(w / 2 - hw, -h / 2); ctx.lineTo(w / 2, 0);
      ctx.lineTo(w / 2 - hw, h / 2); ctx.lineTo(w / 2 - hw, sh / 2); ctx.lineTo(-w / 2, sh / 2); ctx.closePath(); break;
    }
    case 'heart': {
      const x = 0, y = -h * 0.28;
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x, y - h * 0.22, -w / 2, y - h * 0.22, -w / 2, y + h * 0.08);
      ctx.bezierCurveTo(-w / 2, y + h * 0.42, x, y + h * 0.6, x, h / 2);
      ctx.bezierCurveTo(x, y + h * 0.6, w / 2, y + h * 0.42, w / 2, y + h * 0.08);
      ctx.bezierCurveTo(w / 2, y - h * 0.22, x, y - h * 0.22, x, y);
      ctx.closePath(); break;
    }
    case 'line': rr(ctx, -w / 2, -h / 2, w, h, h / 2); break;
    case 'bubble': {
      rr(ctx, -w / 2, -h / 2, w, h * 0.78, Math.min(w, h) * 0.18);
      ctx.moveTo(-w * 0.22, h * 0.28); ctx.lineTo(-w * 0.32, h / 2); ctx.lineTo(-w * 0.04, h * 0.28); break;
    }
    default: rr(ctx, -w / 2, -h / 2, w, h, it.radius || 0);
  }
}

function drawShape(ctx, it, local) {
  if (it.shape === 'progress') {
    const q = Math.max(0, Math.min(1, local / Math.max(0.01, it.duration)));
    ctx.fillStyle = hexToRgba(it.fill, 0.25);
    rr(ctx, -it.w / 2, -it.h / 2, it.w, it.h, it.radius || 0); ctx.fill();
    ctx.fillStyle = it.fill;
    rr(ctx, -it.w / 2, -it.h / 2, it.w * q, it.h, it.radius || 0); ctx.fill();
    return;
  }
  shapePath(ctx, it);
  ctx.fillStyle = it.fill || '#fff';
  ctx.fill();
  if (it.strokeWidth > 0) {
    ctx.lineWidth = it.strokeWidth;
    ctx.strokeStyle = it.strokeColor || '#fff';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

// ---------- medios ----------
function drawMedia(ctx, src, sw, sh, it, local, s) {
  const c = it.crop || {};
  const sx = sw * (c.l || 0), sy = sh * (c.t || 0);
  const sW = Math.max(1, sw * (1 - (c.l || 0) - (c.r || 0)));
  const sH = Math.max(1, sh * (1 - (c.t || 0) - (c.b || 0)));
  const w = it.w, h = it.h;
  const mo = motionState(it, local);
  const needClip = (it.radius || 0) > 0 || mo || s.wipe < 1;
  if (needClip) {
    if (s.wipe < 1) { ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w * s.wipe, h); ctx.clip(); }
    rr(ctx, -w / 2, -h / 2, w, h, it.radius || 0);
    ctx.clip();
  }
  if (mo) { ctx.translate(mo.ox, mo.oy); ctx.scale(mo.ms, mo.ms); }
  ctx.drawImage(src, sx, sy, sW, sH, -w / 2, -h / 2, w, h);
}

function sourceSize(src) {
  return {
    w: src.videoWidth || src.naturalWidth || src.width || 0,
    h: src.videoHeight || src.naturalHeight || src.height || 0,
  };
}

export function subtitleItemFor(item, project) {
  const st = project.subtitleStyle;
  const { width: W } = project;
  return {
    id: item.id, text: item.text, font: st.font, size: st.size, color: st.color, bold: st.bold, italic: st.italic,
    uppercase: st.uppercase, align: 'center', letterSpacing: 0, lineHeight: 1.25, w: W * st.maxWidth,
    bg: { color: st.bgColor, opacity: st.bgOpacity, padding: st.size * 0.28, radius: st.size * 0.22 },
    stroke: { color: st.stroke, width: st.strokeWidth },
    shadow: { color: '#000000', opacity: st.bgOpacity > 0 ? 0 : 0.65, blur: 10, x: 0, y: 3 },
  };
}

function drawItem(ctx, project, it, t, src) {
  const { width: W, height: H } = project;
  const local = t - it.start;
  if (it.type === 'subtitle') {
    const sub = subtitleItemFor(it, project);
    ctx.save();
    ctx.translate(W / 2, H * project.subtitleStyle.position);
    drawTextBlock(ctx, sub);
    ctx.restore();
    return;
  }
  const s = animState(it, local, W, H);
  if (s.alpha <= 0.001 || s.sc <= 0.001) return;
  let drawable = null, sw = 0, sh = 0;
  if (it.type === 'video' || it.type === 'image') {
    drawable = it.type === 'video' ? src.video(it) : src.image(it.mediaId);
    if (!drawable) return;
    const sz = sourceSize(drawable);
    sw = sz.w; sh = sz.h;
    if (!sw || !sh) return;
  }
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, (it.opacity ?? 1) * s.alpha));
  ctx.translate(it.x + s.tx, it.y + s.ty);
  if (it.rotation || s.rot) ctx.rotate(((it.rotation || 0) + s.rot) * Math.PI / 180);
  let sc = s.sc;
  if (it.type === 'text') {
    const mo = motionState(it, local);
    if (mo) sc *= mo.ms;
  }
  ctx.scale(sc * (it.flipH ? -1 : 1), sc * (it.flipV ? -1 : 1));
  const ds = deviceScale(ctx);
  const f = { ...(it.filters || {}) };
  if (s.blur) f.blur = (f.blur || 0) + s.blur;
  const fs = filterString(f, ds);
  if (fs !== 'none') ctx.filter = fs;
  if (drawable) drawMedia(ctx, drawable, sw, sh, it, local, s);
  else if (it.type === 'text') {
    if (s.wipe < 1) { ctx.beginPath(); ctx.rect(-it.w / 2 - 2000, -5000, (it.w + 4000) * s.wipe, 10000); ctx.clip(); }
    drawTextBlock(ctx, it, s.chars);
  } else if (it.type === 'shape') {
    if (s.wipe < 1) { ctx.beginPath(); ctx.rect(-it.w / 2, -it.h / 2 - 50, it.w * s.wipe, it.h + 100); ctx.clip(); }
    drawShape(ctx, it, local);
  }
  ctx.restore();
}

function drawBackground(ctx, project, t, src) {
  const { width: W, height: H, background: bg = {} } = project;
  ctx.fillStyle = bg.color || '#000';
  ctx.fillRect(0, 0, W, H);
  if (bg.type === 'gradient') {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, bg.color || '#000');
    g.addColorStop(1, bg.color2 || '#333');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else if (bg.type === 'blur') {
    for (let i = project.tracks.length - 1; i >= 0; i--) {
      const tr = project.tracks[i];
      if (tr.kind !== 'visual' || tr.hidden) continue;
      const it = tr.items.find((x) => (x.type === 'video' || x.type === 'image') && t >= x.start && t < x.start + x.duration);
      if (!it) continue;
      const d = it.type === 'video' ? src.video(it) : src.image(it.mediaId);
      if (!d) continue;
      const { w, h } = sourceSize(d);
      if (!w || !h) continue;
      const s = Math.max(W / w, H / h) * 1.1;
      ctx.save();
      ctx.filter = `blur(${Math.round(Math.min(W, H) * 0.035 * deviceScale(ctx))}px) brightness(70%)`;
      ctx.drawImage(d, (W - w * s) / 2, (H - h * s) / 2, w * s, h * s);
      ctx.restore();
      break;
    }
  }
}

// Dibuja el fotograma en tiempo t. `scale` = píxeles de salida por unidad del proyecto.
export function drawFrame(ctx, project, t, src, scale = 1) {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.imageSmoothingQuality = 'high';
  drawBackground(ctx, project, t, src);
  const tracks = project.tracks;
  for (let i = tracks.length - 1; i >= 0; i--) {
    const tr = tracks[i];
    if (tr.kind === 'audio' || tr.hidden) continue;
    for (const it of tr.items) {
      if (t >= it.start && t < it.start + it.duration) drawItem(ctx, project, it, t, src);
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// Coordenadas locales de un punto respecto a un item (para selección).
export function toLocal(item, x, y) {
  const a = -(item.rotation || 0) * Math.PI / 180;
  const dx = x - item.x, dy = y - item.y;
  return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
}

export function hitTest(project, t, x, y) {
  for (const tr of project.tracks) {
    if (tr.kind !== 'visual' || tr.hidden) continue;
    for (let i = tr.items.length - 1; i >= 0; i--) {
      const it = tr.items[i];
      if (!(t >= it.start && t < it.start + it.duration)) continue;
      const b = itemBox(it);
      const p = toLocal(it, x, y);
      const tol = 6;
      if (Math.abs(p.x) <= b.w / 2 + tol && Math.abs(p.y) <= b.h / 2 + tol) return it;
    }
  }
  return null;
}

export async function ensureFonts(project) {
  if (!document.fonts) return;
  const fams = new Set(['Manrope']);
  for (const t of project.tracks) for (const i of t.items) if (i.font) fams.add(`${i.bold ? '700' : '400'} ${i.italic ? 'italic' : 'normal'}|${i.font}`);
  if (project.subtitleStyle) fams.add(`${project.subtitleStyle.bold ? '700' : '400'} normal|${project.subtitleStyle.font}`);
  await Promise.all([...fams].map((f) => {
    const [w, fam] = f.includes('|') ? f.split('|') : ['400 normal', f];
    const [weight, style] = w.split(' ');
    return document.fonts.load(`${style === 'italic' ? 'italic ' : ''}${weight} 32px "${fam}"`).catch(() => {});
  }));
}

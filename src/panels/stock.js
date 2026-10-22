// Paneles "Videos" e "Imágenes": bibliotecas gratuitas (Pexels / Pixabay).
import { h, icon, fmtDur, toast, spinner, debounce } from '../ui.js';
import { fetchRemote } from '../media.js';
import { addMediaToTimeline } from '../actions.js';

let statusP;
export function stockStatus() {
  if (!statusP) statusP = fetch('/api/stock?provider=status').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return statusP;
}

export async function searchStock(provider, type, q, page) {
  const r = await fetch(`/api/stock?provider=${provider}&type=${type}&q=${encodeURIComponent(q)}&page=${page}`);
  const d = await r.json().catch(() => ({ error: 'bad_json' }));
  if (!r.ok) throw Object.assign(new Error(d.error || `HTTP ${r.status}`), { code: d.error });
  return d;
}

export function missingKeyNote(provider) {
  const env = { pexels: 'PEXELS_API_KEY', pixabay: 'PIXABAY_API_KEY', jamendo: 'JAMENDO_CLIENT_ID' }[provider];
  const site = { pexels: 'pexels.com/api', pixabay: 'pixabay.com/api/docs', jamendo: 'devportal.jamendo.com' }[provider];
  return h('div', { class: 'note' }, icon('settings', 16),
    h('div', null, h('strong', null, 'Falta configurar la biblioteca'),
      h('p', null, `Crea una key gratuita en ${site} y agrégala en Vercel como variable de entorno `, h('code', null, env), '. Luego vuelve a desplegar.')));
}

export function renderStock(root, type) {
  const providers = { pexels: 'Pexels', pixabay: 'Pixabay' };
  let provider = 'pexels', q = '', page = 1, loading = false, hasMore = true, token = 0;
  const input = h('input', { type: 'search', placeholder: type === 'video' ? 'Buscar videos (ej. playa, ciudad, café)' : 'Buscar imágenes (ej. montaña, comida)', 'aria-label': 'Buscar' });
  const tabs = h('div', { class: 'chips' }, Object.entries(providers).map(([k, l]) => h('button', {
    type: 'button', class: `chip${k === provider ? ' on' : ''}`, onclick: (e) => { provider = k; tabs.querySelectorAll('.on').forEach((x) => x.classList.remove('on')); e.currentTarget.classList.add('on'); reset(); },
  }, l)));
  const suggestions = h('div', { class: 'chips small' }, (type === 'video' ? ['naturaleza', 'ciudad', 'personas', 'tecnología', 'comida', 'océano', 'abstracto', 'deporte'] : ['paisaje', 'oficina', 'textura', 'café', 'cielo', 'flores', 'negocios', 'animales'])
    .map((s) => h('button', { type: 'button', class: 'chip ghost', onclick: () => { input.value = s; q = s; reset(); } }, s)));
  const grid = h('div', { class: `stock-grid stock-${type}` });
  const more = h('button', { type: 'button', class: 'btn ghost full hidden', onclick: () => load() }, 'Cargar más');
  const status = h('div', { class: 'stock-status' });
  const credit = h('p', { class: 'credit' }, 'Contenido gratuito de ', h('a', { href: 'https://www.pexels.com', target: '_blank', rel: 'noopener' }, 'Pexels'), ' y ', h('a', { href: 'https://pixabay.com', target: '_blank', rel: 'noopener' }, 'Pixabay'), '.');

  root.append(h('div', { class: 'search' }, icon('search', 16), input), tabs, suggestions, status, grid, more, credit);
  input.addEventListener('input', debounce(() => { q = input.value.trim(); reset(); }, 450));

  function reset() { page = 1; hasMore = true; grid.replaceChildren(); load(); }

  async function load() {
    if (loading || !hasMore) return;
    loading = true;
    const my = ++token;
    status.replaceChildren(spinner(18));
    more.classList.add('hidden');
    try {
      const d = await searchStock(provider, type, q, page);
      if (my !== token) return;
      status.replaceChildren();
      if (!d.results.length && page === 1) status.append(h('p', { class: 'muted center small' }, 'Sin resultados. Prueba otra búsqueda.'));
      for (const r of d.results) grid.append(card(r));
      hasMore = d.hasMore;
      page++;
      more.classList.toggle('hidden', !hasMore);
    } catch (e) {
      if (my !== token) return;
      status.replaceChildren(e.code === 'missing_key' ? missingKeyNote(provider)
        : h('div', { class: 'note warn' }, icon('x', 16), h('div', null, h('strong', null, 'No se pudo cargar la biblioteca'), h('p', null, location.hostname === 'localhost' ? 'En local usa "vercel dev" para que funcione /api.' : String(e.message)))));
    } finally {
      if (my === token) loading = false;
    }
  }

  function card(r) {
    const el = h('div', { class: 'scard', title: `${r.title} · ${r.author}` },
      h('img', { src: r.thumb, alt: r.title, loading: 'lazy', draggable: false }),
      r.duration ? h('span', { class: 'badge' }, fmtDur(r.duration)) : null,
      h('span', { class: 'scard-author' }, r.author),
      h('div', { class: 'scard-add' }, icon('plus', 18)));
    if (type === 'video' && r.preview) {
      let v;
      el.addEventListener('mouseenter', () => {
        v = h('video', { src: r.preview, muted: true, autoplay: true, loop: true, playsInline: true, class: 'scard-preview' });
        v.muted = true;
        el.append(v);
      });
      el.addEventListener('mouseleave', () => { v?.remove(); v = null; });
    }
    el.addEventListener('click', async () => {
      if (el.classList.contains('loading')) return;
      el.classList.add('loading');
      const prog = h('div', { class: 'scard-prog' }, h('i'));
      el.append(prog);
      try {
        const m = await fetchRemote(r.url, { name: `${r.provider} ${r.author}`.slice(0, 60), type, onProgress: (p) => { prog.firstChild.style.width = `${p * 100}%`; } });
        addMediaToTimeline(m, type === 'video' || type === 'image' ? {} : undefined);
        toast('Añadido a la línea de tiempo', 'success');
      } catch (e) {
        console.error(e);
        toast('No se pudo descargar el archivo', 'error');
      } finally {
        el.classList.remove('loading');
        prog.remove();
      }
    });
    return el;
  }

  const io = new IntersectionObserver((ents) => { if (ents.some((e) => e.isIntersecting) && page > 1) load(); });
  io.observe(more);
  load();
}

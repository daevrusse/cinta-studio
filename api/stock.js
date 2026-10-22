// Búsqueda en bibliotecas de stock (Pexels, Pixabay, Jamendo).
// Las API keys viven en variables de entorno de Vercel y nunca llegan al navegador.
export const config = { runtime: 'edge' };

const json = (data, status = 200, cache = true) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cache && status === 200 ? 'public, s-maxage=1800, max-age=300' : 'no-store',
    },
  });

const PER_PAGE = 24;

function pickPexelsFile(files, maxH = 1080) {
  const mp4 = files.filter((f) => f.file_type === 'video/mp4' && f.height);
  const ok = mp4.filter((f) => Math.min(f.width, f.height) <= maxH).sort((a, b) => b.height * b.width - a.height * a.width);
  return ok[0] || mp4.sort((a, b) => a.height - b.height)[0] || files[0];
}
function smallestPexels(files) {
  const mp4 = files.filter((f) => f.file_type === 'video/mp4' && f.height).sort((a, b) => a.width * a.height - b.width * b.height);
  return mp4[0] || files[0];
}

async function pexels(type, q, page, key) {
  const headers = { Authorization: key };
  if (type === 'video') {
    const url = q
      ? `https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&per_page=${PER_PAGE}&page=${page}`
      : `https://api.pexels.com/videos/popular?per_page=${PER_PAGE}&page=${page}`;
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error(`Pexels ${r.status}`);
    const d = await r.json();
    return (d.videos || []).map((v) => {
      const f = pickPexelsFile(v.video_files || []);
      const s = smallestPexels(v.video_files || []);
      return {
        id: `pexels-v-${v.id}`, provider: 'Pexels', kind: 'video', thumb: v.image, preview: s?.link,
        url: f?.link, width: f?.width || v.width, height: f?.height || v.height, duration: v.duration,
        author: v.user?.name || 'Pexels', title: `Video de ${v.user?.name || 'Pexels'}`,
      };
    });
  }
  const url = q
    ? `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=${PER_PAGE}&page=${page}`
    : `https://api.pexels.com/v1/curated?per_page=${PER_PAGE}&page=${page}`;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`Pexels ${r.status}`);
  const d = await r.json();
  return (d.photos || []).map((p) => ({
    id: `pexels-i-${p.id}`, provider: 'Pexels', kind: 'image', thumb: p.src?.medium, url: p.src?.large2x || p.src?.original,
    width: p.width, height: p.height, author: p.photographer, title: p.alt || `Foto de ${p.photographer}`,
  }));
}

async function pixabay(type, q, page, key) {
  const base = type === 'video' ? 'https://pixabay.com/api/videos/' : 'https://pixabay.com/api/';
  const url = `${base}?key=${key}&q=${encodeURIComponent(q || '')}&per_page=${PER_PAGE}&page=${page}&safesearch=true${type === 'image' ? '&image_type=photo' : ''}${q ? '' : '&order=popular'}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Pixabay ${r.status}`);
  const d = await r.json();
  if (type === 'video') {
    return (d.hits || []).map((v) => {
      const big = v.videos?.large?.url ? v.videos.large : v.videos?.medium;
      const tiny = v.videos?.tiny || v.videos?.small;
      return {
        id: `pixabay-v-${v.id}`, provider: 'Pixabay', kind: 'video',
        thumb: tiny?.thumbnail || v.videos?.medium?.thumbnail || `https://i.vimeocdn.com/video/${v.picture_id}_295x166.jpg`,
        preview: tiny?.url, url: big?.url, width: big?.width, height: big?.height, duration: v.duration,
        author: v.user, title: v.tags || 'Video de Pixabay',
      };
    });
  }
  return (d.hits || []).map((p) => ({
    id: `pixabay-i-${p.id}`, provider: 'Pixabay', kind: 'image', thumb: p.webformatURL, url: p.largeImageURL,
    width: p.imageWidth, height: p.imageHeight, author: p.user, title: p.tags || 'Imagen de Pixabay',
  }));
}

async function jamendo(q, page, key) {
  const offset = (page - 1) * PER_PAGE;
  const url = `https://api.jamendo.com/v3.0/tracks/?client_id=${key}&format=json&limit=${PER_PAGE}&offset=${offset}&audioformat=mp32&include=musicinfo${q ? `&search=${encodeURIComponent(q)}` : '&order=popularity_week'}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Jamendo ${r.status}`);
  const d = await r.json();
  if (d.headers?.status === 'failed') throw new Error(d.headers.error_message || 'Jamendo falló');
  return (d.results || []).map((t) => ({
    id: `jamendo-${t.id}`, provider: 'Jamendo', kind: 'audio', thumb: t.image, url: t.audio, preview: t.audio,
    duration: t.duration, author: t.artist_name, title: t.name,
    tags: (t.musicinfo?.tags?.genres || []).slice(0, 2).join(', '),
  }));
}

export default async function handler(req) {
  const u = new URL(req.url);
  const provider = u.searchParams.get('provider');
  const type = u.searchParams.get('type') === 'video' ? 'video' : 'image';
  const q = (u.searchParams.get('q') || '').slice(0, 100).trim();
  const page = Math.max(1, Math.min(50, parseInt(u.searchParams.get('page') || '1', 10) || 1));
  const env = (k) => (typeof process !== 'undefined' ? process.env[k] : undefined);

  if (provider === 'status') {
    return json({ pexels: !!env('PEXELS_API_KEY'), pixabay: !!env('PIXABAY_API_KEY'), jamendo: !!env('JAMENDO_CLIENT_ID') }, 200, false);
  }
  try {
    let results;
    if (provider === 'pexels') {
      if (!env('PEXELS_API_KEY')) return json({ error: 'missing_key', provider }, 400, false);
      results = await pexels(type, q, page, env('PEXELS_API_KEY'));
    } else if (provider === 'pixabay') {
      if (!env('PIXABAY_API_KEY')) return json({ error: 'missing_key', provider }, 400, false);
      results = await pixabay(type, q, page, env('PIXABAY_API_KEY'));
    } else if (provider === 'jamendo') {
      if (!env('JAMENDO_CLIENT_ID')) return json({ error: 'missing_key', provider }, 400, false);
      results = await jamendo(q, page, env('JAMENDO_CLIENT_ID'));
    } else {
      return json({ error: 'unknown_provider' }, 400, false);
    }
    return json({ results: results.filter((r) => r.url), page, hasMore: results.length >= PER_PAGE });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 502, false);
  }
}

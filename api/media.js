// Proxy de descarga para archivos de stock: evita bloqueos CORS y permite
// que el video/imagen se use dentro del lienzo y en la exportación.
export const config = { runtime: 'edge' };

const ALLOWED = [
  'pexels.com', 'videos.pexels.com', 'images.pexels.com', 'player.vimeo.com', 'vimeocdn.com',
  'pixabay.com', 'cdn.pixabay.com',
  'jamendo.com', 'storage.jamendo.com', 'jamendo.net',
  'pollinations.ai', 'image.pollinations.ai',
];

function allowed(host) {
  return ALLOWED.some((d) => host === d || host.endsWith('.' + d));
}

export default async function handler(req) {
  const target = new URL(req.url).searchParams.get('url');
  if (!target) return new Response('Falta url', { status: 400 });
  let u;
  try { u = new URL(target); } catch { return new Response('URL inválida', { status: 400 }); }
  if (u.protocol !== 'https:' || !allowed(u.hostname)) return new Response('Dominio no permitido', { status: 403 });

  const upstream = await fetch(u.toString(), { redirect: 'follow', headers: { 'user-agent': 'CintaStudio/1.0' } });
  if (!upstream.ok || !upstream.body) return new Response(`Origen respondió ${upstream.status}`, { status: 502 });

  const headers = new Headers();
  headers.set('content-type', upstream.headers.get('content-type') || 'application/octet-stream');
  const len = upstream.headers.get('content-length');
  if (len) headers.set('content-length', len);
  headers.set('access-control-allow-origin', '*');
  headers.set('cache-control', 'public, max-age=86400, s-maxage=86400');
  return new Response(upstream.body, { status: 200, headers });
}

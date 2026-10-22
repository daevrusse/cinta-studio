// Carga perezosa de ffmpeg.wasm (solo se descarga si se necesita).
let instance;
const CORE = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';

export async function getFFmpeg() {
  if (instance) return instance;
  instance = (async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const { toBlobURL } = await import('@ffmpeg/util');
    const ff = new FFmpeg();
    let lastErr;
    for (const base of [CORE, 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm']) {
      try {
        await ff.load({
          coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        return ff;
      } catch (e) { lastErr = e; }
    }
    throw lastErr;
  })();
  try {
    return await instance;
  } catch (e) {
    instance = null;
    throw e;
  }
}

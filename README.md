# Cinta Studio — editor de video en el navegador

Editor de video completo inspirado en los editores online modernos: línea de tiempo multipista, texto, subtítulos con IA, voz en off, música, grabación y exportación MP4. Todo el procesamiento ocurre en el navegador del usuario.

## Funciones

| Panel | Qué hace |
|---|---|
| **Archivos** | Subir video/imagen/audio (clic, arrastrar o pegar). Se guardan en el navegador (IndexedDB). Formatos que el navegador no reproduce (p. ej. MOV HEVC, AVI) se convierten a MP4 con ffmpeg.wasm. |
| **Generar (IA)** | 4 imágenes por prompt con estilos; "Video desde un guion": una imagen por escena + movimiento Ken Burns + textos. |
| **Videos / Imágenes** | Bibliotecas gratuitas Pexels y Pixabay con búsqueda, vista previa al pasar el mouse y descarga directa. |
| **Texto** | Título, subtítulo, cuerpo y 12 estilos (impacto, neón, tercio inferior, máquina de escribir…). |
| **Subtítulos** | Transcripción automática con Whisper en el navegador (3 calidades, 6 idiomas), edición de tiempos, estilos, importar/exportar SRT/VTT. |
| **Elementos** | 11 formas (incl. barra de progreso animada) y 48 emojis. |
| **Audio** | Subir audio, música libre (Jamendo) con vista previa, 10 efectos de sonido sintetizados. |
| **Voz en off** | Texto a voz con IA en el navegador (español, inglés, portugués, francés, alemán) y grabación con micrófono sincronizada. |
| **Grabar** | Cámara, pantalla o pantalla + cámara en círculo. |
| **Lienzo** | 7 formatos (16:9, 9:16, 1:1, 4:5, 4:3, 21:9, 2:3) y fondo color / degradado / desenfoque. |

**Edición:** mover, escalar y rotar en el lienzo con guías de centrado · recortar bordes de clips · dividir (S) · duplicar · copiar/pegar · imán · zoom · pistas ocultar/silenciar · separar audio · velocidad 0.1×–8× · volumen hasta 200 % con fundidos · 12 filtros + 7 ajustes · recorte de encuadre · esquinas redondeadas · voltear · 13 animaciones de entrada/salida · movimiento continuo · deshacer/rehacer ilimitado · autoguardado.

**Exportar:** MP4 H.264 + AAC, de 480p a 4K, 24/25/30/60 fps, 3 calidades. Usa WebCodecs (rápido) y ffmpeg.wasm como respaldo. También exporta fotograma PNG, audio WAV y el proyecto en JSON.

## Despliegue (sin terminal)

1. Crea un repositorio en GitHub y arrastra **todo el contenido de esta carpeta** (sin `node_modules` ni `dist`).
2. En Vercel → *Add New Project* → importa el repositorio. Vercel detecta Vite solo.
3. En *Settings → Environment Variables* agrega (son gratuitas):
   - `PEXELS_API_KEY` → https://www.pexels.com/api/
   - `PIXABAY_API_KEY` → https://pixabay.com/api/docs/
   - `JAMENDO_CLIENT_ID` → https://devportal.jamendo.com/
4. *Redeploy*. Listo.

Sin las keys el editor funciona igual; solo los paneles de stock y música muestran un aviso para configurarlas.

## Desarrollo local

```bash
npm install
npx vercel dev   # incluye las funciones /api
# o: npm run dev  (sin bibliotecas de stock)
```

## Notas

- **Navegador recomendado:** Chrome o Edge de escritorio (exportación H.264/AAC acelerada). Firefox y Safari recientes funcionan; si el navegador no tiene AAC, el audio se codifica con ffmpeg.wasm.
- **IA en el navegador:** la primera vez se descargan los modelos (40–250 MB para subtítulos, ~30 MB por voz) y quedan en caché.
- **Privacidad:** los archivos del usuario nunca salen de su equipo. Solo las búsquedas de stock y la generación de imágenes usan servicios externos.
- La generación de imágenes usa Pollinations (gratuito, sin key); puede saturarse en horas pico.

## Estructura

```
api/stock.js        búsqueda Pexels / Pixabay / Jamendo (keys en el servidor)
api/media.js        proxy de descarga con lista de dominios permitidos
src/main.js         arranque, barra superior, exportación, atajos
src/state.js        modelo del proyecto, historial, pistas
src/renderer.js     motor de composición (vista previa = exportación)
src/player.js       reproducción y sincronización de audio/video
src/timeline.js     línea de tiempo
src/preview.js      lienzo y manipulación directa
src/properties.js   panel de propiedades
src/export.js       WebCodecs + mp4-muxer / ffmpeg.wasm
src/ai-worker.js    Whisper + MMS-TTS (transformers.js)
src/panels/*        paneles laterales
```

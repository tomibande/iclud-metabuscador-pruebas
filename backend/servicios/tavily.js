// Traduce filtros -> consulta en lenguaje natural, busca en la web y devuelve texto crudo.
// NO interpreta ni estructura nada: de eso se encarga gemini.js.
import { tavily } from '@tavily/core';

const ETIQUETA_SERVICIO = { wifi: 'Wi-Fi', cocina: 'cocina', estacionamiento: 'estacionamiento' };

// El cliente se crea al primer uso, cuando el .env ya está cargado (no al importar el archivo).
let cliente;
const clientePorDefecto = () => (cliente ??= tavily({ apiKey: process.env.TAVILY_API_KEY }));

// Función pura: los mismos filtros dan siempre la misma consulta. Por eso se testea sola.
export function construirConsulta(f) {
  const partes = [`Hoteles y alojamientos en ${f.destino} para ${f.huespedes} huéspedes con precio por noche`];
  if (f.precioMax) partes.push(`hasta ${f.precioMax} ${process.env.MONEDA_FILTRO || 'USD'} por noche`);
  if (f.checkIn) partes.push(`del ${f.checkIn} al ${f.checkOut}`);
  if (f.servicios.length) partes.push(`con ${f.servicios.map((s) => ETIQUETA_SERVICIO[s]).join(', ')}`);
  return partes.join(' ');
}

// Separada de la llamada de red a propósito: se puede testear sin salir a internet.
// Guardamos las URLs e imágenes en Sets porque después hay que verificar contra ellos
// que Gemini no haya inventado ninguna (ver lib/filtrar.js).
export function armarTextoCrudo({ results = [], images = [] } = {}) {
  const imagenes = images
    .map((i) => (typeof i === 'string' ? { url: i, descripcion: '' } : { url: i.url, descripcion: i.description ?? '' }))
    .filter((i) => i.url);

  const texto =
    results.map((r) => `FUENTE: ${r.url}\nTITULO: ${r.title}\nCONTENIDO: ${r.content}`).join('\n---\n') +
    (imagenes.length
      ? '\n=== IMAGENES ===\n' + imagenes.map((i) => `IMAGEN: ${i.url} | ${i.descripcion}`).join('\n')
      : '');

  return {
    texto,
    urls: new Set(results.map((r) => r.url)),
    imagenes: new Set(imagenes.map((i) => i.url)),
  };
}

// obtenerCliente se puede reemplazar en los tests para no gastar créditos de Tavily.
export async function buscarEnWeb(filtros, obtenerCliente = clientePorDefecto) {
  const respuesta = await obtenerCliente().search(construirConsulta(filtros), {
    // "basic" en desarrollo gasta menos créditos; "advanced" da mejores resultados en producción.
    searchDepth: process.env.TAVILY_DEPTH || 'basic',
    maxResults: 10,
    includeAnswer: false,
    includeImages: true,
    includeImageDescriptions: true,
    // OJO: el SDK espera SEGUNDOS, no milisegundos. Si Tavily tarda más, corta y el endpoint responde 502.
    timeout: Number(process.env.TAVILY_TIMEOUT_S || 20),
  });
  return armarTextoCrudo(respuesta);
}

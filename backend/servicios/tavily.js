// Traduce filtros -> consulta en lenguaje natural, busca en la web y devuelve texto crudo.
// NO interpreta ni estructura nada.
const ETIQUETA_SERVICIO = { wifi: 'Wi-Fi', cocina: 'cocina', estacionamiento: 'estacionamiento' };

export function construirConsulta(f) {
  const partes = [`Hoteles y alojamientos en ${f.destino} para ${f.huespedes} huéspedes con precio por noche`];
  if (f.precioMax) partes.push(`hasta ${f.precioMax} ${process.env.MONEDA_FILTRO || 'USD'} por noche`);
  if (f.checkIn) partes.push(`del ${f.checkIn} al ${f.checkOut}`);
  if (f.servicios.length) partes.push(`con ${f.servicios.map((s) => ETIQUETA_SERVICIO[s]).join(', ')}`);
  return partes.join(' ');
}

export async function buscarEnWeb(filtros) {
  const resp = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify({
      query: construirConsulta(filtros),
      search_depth: 'basic',
      max_results: 10,
      include_answer: false,
      include_images: true,
      include_image_descriptions: true,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) throw new Error(`Tavily respondió ${resp.status}`);

  const data = await resp.json();
  const resultados = data.results ?? [];
  const imagenes = (data.images ?? [])
    .map((i) => (typeof i === 'string' ? { url: i, descripcion: '' } : { url: i.url, descripcion: i.description ?? '' }))
    .filter((i) => i.url);

  const texto =
    resultados.map((r) => `FUENTE: ${r.url}\nTITULO: ${r.title}\nCONTENIDO: ${r.content}`).join('\n---\n') +
    (imagenes.length
      ? '\n=== IMAGENES ===\n' + imagenes.map((i) => `IMAGEN: ${i.url} | ${i.descripcion}`).join('\n')
      : '');

  return {
    texto,
    urls: new Set(resultados.map((r) => r.url)),
    imagenes: new Set(imagenes.map((i) => i.url)),
  };
}

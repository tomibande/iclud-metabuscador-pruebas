// Paso 3.4 del DFD: arma la respuesta final a partir de lo que estructuró Gemini.
// Todo lo que no se pueda comprobar contra lo que devolvió la web se descarta (RNF-01).
export function filtrarResultados(crudos, filtros, { urls, imagenes }, moneda = 'USD') {
  const vistas = new Set();
  return crudos
    // la URL debe ser una de las que devolvió la web, sin modificar
    .filter((r) => r && typeof r.url === 'string' && urls.has(r.url))
    // sin duplicados
    .filter((r) => (vistas.has(r.url) ? false : vistas.add(r.url)))
    // RF-04: fuera lo que supera el máximo (solo si la moneda es comparable)
    .filter((r) => !(filtros.precioMax && r.precioNumero != null && r.moneda === moneda && r.precioNumero > filtros.precioMax))
    // RF-06: debe afirmar todos los servicios pedidos
    .filter((r) => filtros.servicios.every((s) => (r.servicios ?? []).includes(s)))
    .map((r) => ({
      nombre: String(r.nombre ?? ''),
      precio: r.precio || 'No disponible',
      precioNumero: r.precioNumero ?? null,
      moneda: r.moneda ?? null,
      descripcion: String(r.descripcion ?? ''),
      url: r.url,
      imagen: r.imagen && imagenes.has(r.imagen) ? r.imagen : null,
      servicios: r.servicios ?? [],
    }));
}

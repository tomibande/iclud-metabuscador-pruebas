// Paso 3.4 del DFD: arma la respuesta final a partir de lo que estructuró Gemini.
// Todo lo que no se pueda comprobar contra lo que devolvió la web se descarta (RNF-01).
import { SERVICIOS_VALIDOS } from './validar.js';

export const MAX_RESULTADOS = 6;
export const MAX_PALABRAS_DESCRIPCION = 25;

// Red de seguridad: el prompt le pide 25 palabras a Gemini, pero no confiamos
// en que las respete. Acá se garantiza por código.
export function recortarDescripcion(texto, maximo = MAX_PALABRAS_DESCRIPCION) {
  const palabras = String(texto ?? '').trim().split(/\s+/).filter(Boolean);
  if (palabras.length <= maximo) return palabras.join(' ');
  return palabras.slice(0, maximo).join(' ') + '…';
}

export function filtrarResultados(crudos, filtros, { urls, imagenes }) {
  const vistas = new Set();
  return crudos
    // la URL debe ser una de las que devolvió la web, sin modificar (así se detecta si Gemini inventó)
    .filter((r) => r && typeof r.url === 'string' && urls.has(r.url))
    // sin duplicados
    .filter((r) => (vistas.has(r.url) ? false : vistas.add(r.url)))
    // RF-06: debe afirmar todos los servicios pedidos
    .filter((r) => filtros.servicios.every((s) => (r.servicios ?? []).includes(s)))
    // el prompt pide un máximo, pero el corte real lo hace el backend
    .slice(0, MAX_RESULTADOS)
    .map((r) => ({
      nombre: String(r.nombre ?? ''),
      precio: r.precio || 'No disponible',
      descripcion: recortarDescripcion(r.descripcion),
      url: r.url,
      servicios: (r.servicios ?? []).filter((s) => SERVICIOS_VALIDOS.includes(s)),
      // no es parte del shape pedido, pero las tarjetas ya lo usaban; solo se acepta
      // si la imagen vino realmente de la búsqueda
      imagen: r.imagen && imagenes.has(r.imagen) ? r.imagen : null,
    }));
}

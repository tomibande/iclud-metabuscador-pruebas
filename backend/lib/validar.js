// RNF-04: validación de entrada. Lo inválido se rechaza sin llegar a Tavily ni Gemini.
export const SERVICIOS_VALIDOS = ['wifi', 'cocina', 'estacionamiento'];

const RE_DESTINO = /^[\p{L}\p{N}\s,.'’-]+$/u; // evita meter instrucciones raras en la consulta
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function validarFiltros(b) {
  if (!b || typeof b !== 'object') return { error: 'Solicitud inválida.' };

  const destino = typeof b.destino === 'string' ? b.destino.trim() : '';
  if (!destino || destino.length > 80 || !RE_DESTINO.test(destino)) {
    return { error: 'Ingresá un destino de hasta 80 caracteres (solo letras, números y signos simples).' };
  }

  const huespedes = Number(b.huespedes ?? 1);
  if (!Number.isInteger(huespedes) || huespedes < 1 || huespedes > 20) {
    return { error: 'La cantidad de huéspedes debe estar entre 1 y 20.' };
  }

  let precioMax = null;
  if (b.precioMax !== undefined && b.precioMax !== null && b.precioMax !== '') {
    precioMax = Number(b.precioMax);
    if (!Number.isFinite(precioMax) || precioMax <= 0 || precioMax > 10_000_000) {
      return { error: 'El precio máximo debe ser un número positivo.' };
    }
  }

  const fecha = (v) => {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v !== 'string' || !RE_FECHA.test(v) || Number.isNaN(Date.parse(v))) return false;
    return v;
  };
  const checkIn = fecha(b.checkIn);
  const checkOut = fecha(b.checkOut);
  if (checkIn === false || checkOut === false) return { error: 'Las fechas deben tener formato AAAA-MM-DD.' };
  if ((checkIn && !checkOut) || (!checkIn && checkOut)) return { error: 'Indicá fecha de llegada y de salida.' };
  if (checkIn && checkOut <= checkIn) return { error: 'La salida debe ser posterior a la llegada.' };

  let servicios = [];
  if (b.servicios !== undefined) {
    if (!Array.isArray(b.servicios) || !b.servicios.every((s) => SERVICIOS_VALIDOS.includes(s))) {
      return { error: 'Servicios inválidos.' };
    }
    servicios = [...new Set(b.servicios)];
  }

  return { valor: { destino, huespedes, precioMax, checkIn, checkOut, servicios } };
}

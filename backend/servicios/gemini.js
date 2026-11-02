// Recibe texto crudo y lo estructura contra un responseSchema fijo. No inventa datos.
import { GoogleGenAI, Type } from '@google/genai';
import { SERVICIOS_VALIDOS } from '../lib/validar.js';
import { MAX_RESULTADOS, MAX_PALABRAS_DESCRIPCION } from '../lib/filtrar.js';

let ai; // se crea al primer uso, cuando el .env ya está cargado
const cliente = () => (ai ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));

// Forma exacta pedida por el equipo. El schema la fuerza: el modelo no puede
// devolver campos de más ni cambiar los tipos.
const responseSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      nombre: { type: Type.STRING },
      precio: { type: Type.STRING, description: 'Precio por noche tal cual figura en la fuente, o "No disponible".' },
      descripcion: { type: Type.STRING, description: `Máximo ${MAX_PALABRAS_DESCRIPCION} palabras.` },
      url: { type: Type.STRING },
      servicios: { type: Type.ARRAY, items: { type: Type.STRING, enum: SERVICIOS_VALIDOS } },
      imagen: { type: Type.STRING, nullable: true },
    },
    required: ['nombre', 'precio', 'descripcion', 'url', 'servicios'],
  },
};

const SISTEMA = `Sos un extractor de datos de alojamientos. Recibís texto crudo de una búsqueda web con bloques FUENTE / TITULO / CONTENIDO y, al final, una lista de IMAGEN.
Reglas estrictas:
1. Devolvé SOLO alojamientos reales (hoteles, hostels, cabañas, departamentos, apart-hoteles) ubicados en el destino pedido. Descartá todo lo demás: restaurantes, comida, notas de blog, tours, vuelos, otros destinos.
2. NO inventes datos. Si el precio por noche no aparece en el texto, "precio" = "No disponible".
3. "url" debe ser la FUENTE copiada EXACTAMENTE, sin modificarla.
4. "servicios": incluí wifi, cocina o estacionamiento SOLO si el texto lo afirma explícitamente. Nunca los supongas.
5. "imagen": usá una URL de la lista de IMAGEN solo si su descripción corresponde claramente a ese alojamiento; si no, null.
6. "descripcion": una o dos frases basadas solo en el texto, de ${MAX_PALABRAS_DESCRIPCION} palabras como máximo.
7. Devolvé como máximo ${MAX_RESULTADOS} resultados. Preferí 2 buenos antes que ${MAX_RESULTADOS} dudosos.
8. Ante la duda, descartá el resultado antes que forzarlo. Si no hay ninguno válido, devolvé [].`;

export async function estructurar(textoCrudo, filtros) {
  const respuesta = await cliente().models.generateContent({
    model: process.env.GEMINI_MODEL,
    contents: `Destino pedido: ${filtros.destino}\n\n${textoCrudo}`,
    config: {
      systemInstruction: SISTEMA,
      responseMimeType: 'application/json',
      responseSchema,
      // Si Gemini tarda demasiado, cortamos: el endpoint responde 502 en vez de quedar colgado.
      abortSignal: AbortSignal.timeout(Number(process.env.GEMINI_TIMEOUT_MS || 25_000)),
    },
  });

  let datos;
  try {
    datos = JSON.parse(respuesta.text);
  } catch {
    throw new Error('Gemini devolvió un JSON inválido');
  }
  return Array.isArray(datos) ? datos : [];
}

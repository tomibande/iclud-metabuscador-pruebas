// Recibe texto crudo y lo estructura contra un responseSchema fijo. No inventa datos.
import { GoogleGenAI, Type } from '@google/genai';
import { SERVICIOS_VALIDOS } from '../lib/validar.js';

let ai; // se crea al primer uso, cuando el .env ya está cargado
const cliente = () => (ai ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));

const responseSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      nombre: { type: Type.STRING },
      precio: { type: Type.STRING, description: 'Precio por noche tal cual figura en la fuente, o "No disponible".' },
      precioNumero: { type: Type.NUMBER, nullable: true },
      moneda: { type: Type.STRING, nullable: true, description: 'Código ISO (USD, ARS, EUR...) o null.' },
      descripcion: { type: Type.STRING },
      url: { type: Type.STRING },
      imagen: { type: Type.STRING, nullable: true },
      servicios: { type: Type.ARRAY, items: { type: Type.STRING, enum: SERVICIOS_VALIDOS } },
    },
    required: ['nombre', 'precio', 'descripcion', 'url'],
  },
};

const SISTEMA = `Sos un extractor de datos de alojamientos. Recibís texto crudo de una búsqueda web con bloques FUENTE / TITULO / CONTENIDO y, al final, una lista de IMAGEN.
Reglas estrictas:
1. Devolvé SOLO alojamientos reales (hoteles, hostels, cabañas, departamentos, apart-hoteles) ubicados en el destino pedido. Descartá todo lo demás: restaurantes, comida, notas de blog, tours, vuelos, otros destinos.
2. NO inventes datos. Si el precio por noche no aparece en el texto, "precio" = "No disponible", "precioNumero" = null y "moneda" = null.
3. "url" debe ser la FUENTE copiada EXACTAMENTE, sin modificarla.
4. "imagen": usá una URL de la lista de IMAGEN solo si su descripción corresponde claramente a ese alojamiento; si no, null.
5. "servicios": incluí solo wifi, cocina o estacionamiento si el texto lo afirma explícitamente.
6. "descripcion": una o dos frases basadas solo en el texto.
7. Ante la duda, descartá el resultado antes que forzarlo. Si no hay ninguno válido, devolvé [].`;

export async function estructurar(textoCrudo, filtros) {
  const respuesta = await cliente().models.generateContent({
    model: process.env.GEMINI_MODEL,
    contents: `Destino pedido: ${filtros.destino}\n\n${textoCrudo}`,
    config: {
      systemInstruction: SISTEMA,
      responseMimeType: 'application/json',
      responseSchema,
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

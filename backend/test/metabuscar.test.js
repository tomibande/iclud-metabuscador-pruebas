import test from 'node:test';
import assert from 'node:assert/strict';
import { crearApp } from '../server.js';

// Levanta la app en un puerto libre con los servicios externos reemplazados:
// así se prueba el endpoint completo sin gastar créditos de Tavily ni de Gemini.
async function conServidor(deps, fn) {
  const servidor = crearApp(deps).listen(0);
  const { port } = servidor.address();
  const post = (cuerpo) => fetch(`http://127.0.0.1:${port}/api/metabuscar`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
  }).then(async (r) => ({ status: r.status, datos: await r.json() }));
  try { await fn(post); } finally { servidor.close(); }
}

const web = { texto: 'FUENTE: https://a.com/1', urls: new Set(['https://a.com/1']), imagenes: new Set() };

test('rechaza entradas inválidas sin llamar a los servicios', async () => {
  let llamadas = 0;
  await conServidor({ buscar: async () => { llamadas++; return web; } }, async (post) => {
    const r = await post({ destino: '', huespedes: 2 });
    assert.equal(r.status, 400);
    assert.ok(r.datos.error, 'el 400 tiene que explicar qué está mal');
    assert.equal(llamadas, 0, 'no se debe gastar un crédito con datos inválidos');
  });
});

test('0 resultados responde 200 con arreglo vacío (no es un error)', async () => {
  const vacio = { texto: '', urls: new Set(), imagenes: new Set() };
  await conServidor({ buscar: async () => vacio }, async (post) => {
    const r = await post({ destino: 'Ushuaia', huespedes: 2 });
    assert.equal(r.status, 200);
    assert.deepEqual(r.datos, []);
  });
});

test('devuelve un arreglo solo con los resultados verificables', async () => {
  const estructurarTexto = async () => [
    { nombre: 'Hotel Uno', precio: 'USD 50', descripcion: 'ok', url: 'https://a.com/1', servicios: ['wifi'] },
    { nombre: 'Inventado', precio: 'USD 10', descripcion: 'x', url: 'https://falso.com', servicios: [] },
  ];
  await conServidor({ buscar: async () => web, estructurarTexto }, async (post) => {
    const r = await post({ destino: 'Mendoza', huespedes: 2 });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.datos), 'el 200 tiene que ser un arreglo pelado');
    assert.deepEqual(r.datos.map((x) => x.nombre), ['Hotel Uno']);
    assert.deepEqual(r.datos[0].servicios, ['wifi']);
  });
});

test('si falla un servicio externo responde 502 sin filtrar el detalle y sigue vivo', async () => {
  await conServidor({ buscar: async () => { throw new Error('TAVILY_API_KEY inválida'); } }, async (post) => {
    const r = await post({ destino: 'Cordoba', huespedes: 2 });
    assert.equal(r.status, 502);
    assert.ok(r.datos.error);
    assert.doesNotMatch(r.datos.error, /TAVILY|API_KEY/i, 'el detalle va solo al log del servidor');
    // el servidor sigue respondiendo después del fallo
    const otra = await post({ destino: '', huespedes: 2 });
    assert.equal(otra.status, 400);
  });
});

test('no llama a Gemini si la web no devolvió ninguna fuente', async () => {
  let llamadasGemini = 0;
  const vacio = { texto: '', urls: new Set(), imagenes: new Set() };
  await conServidor({
    buscar: async () => vacio,
    estructurarTexto: async () => { llamadasGemini++; return []; },
  }, async (post) => {
    await post({ destino: 'Rosario', huespedes: 2 });
    assert.equal(llamadasGemini, 0);
  });
});

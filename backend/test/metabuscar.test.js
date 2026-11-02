import test from 'node:test';
import assert from 'node:assert/strict';
import { crearApp } from '../server.js';

async function conServidor(deps, fn) {
  const servidor = crearApp(deps).listen(0);
  const { port } = servidor.address();
  const post = (cuerpo) => fetch(`http://127.0.0.1:${port}/metabuscar`, {
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
    assert.deepEqual([r.datos.ok, r.datos.resultados], [false, []]);
    assert.equal(llamadas, 0);
  });
});

test('0 resultados responde [] y ok:true (no es un error)', async () => {
  const vacio = { texto: '', urls: new Set(), imagenes: new Set() };
  await conServidor({ buscar: async () => vacio }, async (post) => {
    const r = await post({ destino: 'Ushuaia', huespedes: 2 });
    assert.equal(r.status, 200);
    assert.deepEqual(r.datos, { ok: true, resultados: [] });
  });
});

test('devuelve solo resultados verificables, con el mismo shape', async () => {
  const estructurarTexto = async () => [
    { nombre: 'Hotel Uno', precio: 'USD 50', precioNumero: 50, moneda: 'USD', descripcion: 'ok', url: 'https://a.com/1' },
    { nombre: 'Inventado', precio: 'USD 10', descripcion: 'x', url: 'https://falso.com' },
  ];
  await conServidor({ buscar: async () => web, estructurarTexto }, async (post) => {
    const r = await post({ destino: 'Mendoza', huespedes: 2 });
    assert.equal(r.status, 200);
    assert.equal(r.datos.ok, true);
    assert.deepEqual(r.datos.resultados.map((x) => x.nombre), ['Hotel Uno']);
  });
});

test('si falla un servicio externo responde error claro (502) y sigue vivo', async () => {
  await conServidor({ buscar: async () => { throw new Error('boom'); } }, async (post) => {
    const r = await post({ destino: 'Cordoba', huespedes: 2 });
    assert.equal(r.status, 502);
    assert.equal(r.datos.ok, false);
    assert.deepEqual(r.datos.resultados, []);
    assert.ok(r.datos.error);
    const otra = await post({ destino: '', huespedes: 2 });
    assert.equal(otra.status, 400);
  });
});

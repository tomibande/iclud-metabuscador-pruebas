import test from 'node:test';
import assert from 'node:assert/strict';
import { buscarEnWeb, construirConsulta, armarTextoCrudo } from '../servicios/tavily.js';

const filtros = { destino: 'Salta', huespedes: 3, precioMax: 90, checkIn: null, checkOut: null, servicios: ['wifi'] };

test('arma la consulta con los filtros', () => {
  const q = construirConsulta(filtros);
  assert.match(q, /Salta/);
  assert.match(q, /3 huéspedes/);
  assert.match(q, /90/);
  assert.match(q, /Wi-Fi/);
});

test('convierte la respuesta de Tavily en texto crudo + conjuntos de URLs e imágenes', () => {
  const r = armarTextoCrudo({
    results: [{ url: 'https://h.com/1', title: 'Hotel Uno', content: 'USD 70 por noche' }],
    images: [{ url: 'https://h.com/1.jpg', description: 'Hotel Uno fachada' }],
  });
  assert.match(r.texto, /FUENTE: https:\/\/h\.com\/1/);
  assert.match(r.texto, /IMAGEN: https:\/\/h\.com\/1\.jpg/);
  assert.ok(r.urls.has('https://h.com/1'));
  assert.ok(r.imagenes.has('https://h.com/1.jpg'));
});

test('acepta imágenes que vienen como string suelto y descarta las sin url', () => {
  const r = armarTextoCrudo({ results: [], images: ['https://h.com/a.jpg', { description: 'sin url' }] });
  assert.deepEqual([...r.imagenes], ['https://h.com/a.jpg']);
});

test('le pasa la consulta al SDK con el tiempo límite configurado', async () => {
  let recibido;
  const clienteFalso = () => ({
    search: async (query, opciones) => {
      recibido = { query, opciones };
      return { results: [], images: [] };
    },
  });
  process.env.TAVILY_TIMEOUT_S = '20';
  await buscarEnWeb(filtros, clienteFalso);
  assert.equal(recibido.query, construirConsulta(filtros));
  assert.equal(recibido.opciones.timeout, 20); // en segundos, como espera @tavily/core
  assert.equal(recibido.opciones.includeImages, true);
});

test('propaga el error si el SDK de Tavily falla', async () => {
  const clienteFalso = () => ({ search: async () => { throw new Error('401 Unauthorized'); } });
  await assert.rejects(() => buscarEnWeb(filtros, clienteFalso), /401/);
});

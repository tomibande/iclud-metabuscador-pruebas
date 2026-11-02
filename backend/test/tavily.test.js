import test from 'node:test';
import assert from 'node:assert/strict';
import { buscarEnWeb, construirConsulta } from '../servicios/tavily.js';

const filtros = { destino: 'Salta', huespedes: 3, precioMax: 90, checkIn: null, checkOut: null, servicios: ['wifi'] };

test('arma la consulta con los filtros', () => {
  const q = construirConsulta(filtros);
  assert.match(q, /Salta/);
  assert.match(q, /3 huéspedes/);
  assert.match(q, /90/);
  assert.match(q, /Wi-Fi/);
});

test('convierte la respuesta de Tavily en texto crudo + conjuntos de URLs e imágenes', async () => {
  const original = globalThis.fetch;
  let pedido;
  globalThis.fetch = async (url, opts) => {
    pedido = { url, opts };
    return { ok: true, json: async () => ({
      results: [{ url: 'https://h.com/1', title: 'Hotel Uno', content: 'USD 70 por noche' }],
      images: [{ url: 'https://h.com/1.jpg', description: 'Hotel Uno fachada' }],
    }) };
  };
  try {
    process.env.TAVILY_API_KEY = 'clave-de-prueba';
    const r = await buscarEnWeb(filtros);
    assert.match(r.texto, /FUENTE: https:\/\/h\.com\/1/);
    assert.match(r.texto, /IMAGEN: https:\/\/h\.com\/1\.jpg/);
    assert.ok(r.urls.has('https://h.com/1'));
    assert.ok(r.imagenes.has('https://h.com/1.jpg'));
    assert.equal(pedido.opts.headers.Authorization, 'Bearer clave-de-prueba');
  } finally {
    globalThis.fetch = original;
  }
});

test('lanza error si Tavily responde con falla', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 401 });
  try {
    await assert.rejects(() => buscarEnWeb(filtros), /401/);
  } finally {
    globalThis.fetch = original;
  }
});

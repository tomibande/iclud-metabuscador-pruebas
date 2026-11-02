import test from 'node:test';
import assert from 'node:assert/strict';
import { filtrarResultados } from '../lib/filtrar.js';

const fuentes = { urls: new Set(['https://a.com/1', 'https://b.com/2', 'https://c.com/3']), imagenes: new Set(['https://img.com/x.jpg']) };
const sinFiltros = { precioMax: null, servicios: [] };
const item = (o) => ({ nombre: 'H', precio: 'USD 50', precioNumero: 50, moneda: 'USD', descripcion: 'd', servicios: [], ...o });

test('descarta URLs que no vinieron de la web', () => {
  const r = filtrarResultados([item({ url: 'https://a.com/1' }), item({ url: 'https://inventada.com' })], sinFiltros, fuentes);
  assert.deepEqual(r.map((x) => x.url), ['https://a.com/1']);
});
test('elimina duplicados', () => {
  const r = filtrarResultados([item({ url: 'https://a.com/1' }), item({ url: 'https://a.com/1' })], sinFiltros, fuentes);
  assert.equal(r.length, 1);
});
test('aplica precio máximo solo si la moneda coincide; sin precio se conserva', () => {
  const f = { precioMax: 80, servicios: [] };
  const r = filtrarResultados([
    item({ url: 'https://a.com/1', precioNumero: 120 }),
    item({ url: 'https://b.com/2', precioNumero: 120, moneda: 'ARS' }),
    item({ url: 'https://c.com/3', precio: 'No disponible', precioNumero: null, moneda: null }),
  ], f, fuentes);
  assert.deepEqual(r.map((x) => x.url), ['https://b.com/2', 'https://c.com/3']);
  assert.equal(r[1].precio, 'No disponible');
});
test('exige todos los servicios pedidos', () => {
  const f = { precioMax: null, servicios: ['wifi', 'cocina'] };
  const r = filtrarResultados([
    item({ url: 'https://a.com/1', servicios: ['wifi', 'cocina'] }),
    item({ url: 'https://b.com/2', servicios: ['wifi'] }),
  ], f, fuentes);
  assert.deepEqual(r.map((x) => x.url), ['https://a.com/1']);
});
test('solo conserva imágenes que vinieron de la web', () => {
  const r = filtrarResultados([
    item({ url: 'https://a.com/1', imagen: 'https://img.com/x.jpg' }),
    item({ url: 'https://b.com/2', imagen: 'https://inventada.com/y.jpg' }),
  ], sinFiltros, fuentes);
  assert.equal(r[0].imagen, 'https://img.com/x.jpg');
  assert.equal(r[1].imagen, null);
});

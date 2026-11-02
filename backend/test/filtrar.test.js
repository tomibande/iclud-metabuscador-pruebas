import test from 'node:test';
import assert from 'node:assert/strict';
import { filtrarResultados, recortarDescripcion, MAX_RESULTADOS, MAX_PALABRAS_DESCRIPCION } from '../lib/filtrar.js';

const fuentes = {
  urls: new Set(['https://a.com/1', 'https://b.com/2', 'https://c.com/3']),
  imagenes: new Set(['https://img.com/x.jpg']),
};
const sinFiltros = { precioMax: null, servicios: [] };
const item = (o) => ({ nombre: 'H', precio: 'USD 50', descripcion: 'd', servicios: [], ...o });

test('descarta URLs que no vinieron de la web', () => {
  const r = filtrarResultados([item({ url: 'https://a.com/1' }), item({ url: 'https://inventada.com' })], sinFiltros, fuentes);
  assert.deepEqual(r.map((x) => x.url), ['https://a.com/1']);
});

test('elimina duplicados', () => {
  const r = filtrarResultados([item({ url: 'https://a.com/1' }), item({ url: 'https://a.com/1' })], sinFiltros, fuentes);
  assert.equal(r.length, 1);
});

test('exige todos los servicios pedidos', () => {
  const f = { precioMax: null, servicios: ['wifi', 'cocina'] };
  const r = filtrarResultados([
    item({ url: 'https://a.com/1', servicios: ['wifi', 'cocina'] }),
    item({ url: 'https://b.com/2', servicios: ['wifi'] }),
  ], f, fuentes);
  assert.deepEqual(r.map((x) => x.url), ['https://a.com/1']);
});

test('descarta servicios que no están en la lista permitida', () => {
  const r = filtrarResultados([item({ url: 'https://a.com/1', servicios: ['wifi', 'pileta'] })], sinFiltros, fuentes);
  assert.deepEqual(r[0].servicios, ['wifi']);
});

test('solo conserva imágenes que vinieron de la web', () => {
  const r = filtrarResultados([
    item({ url: 'https://a.com/1', imagen: 'https://img.com/x.jpg' }),
    item({ url: 'https://b.com/2', imagen: 'https://inventada.com/y.jpg' }),
  ], sinFiltros, fuentes);
  assert.equal(r[0].imagen, 'https://img.com/x.jpg');
  assert.equal(r[1].imagen, null);
});

test('sin precio en la fuente el campo queda en "No disponible"', () => {
  const r = filtrarResultados([item({ url: 'https://a.com/1', precio: '' })], sinFiltros, fuentes);
  assert.equal(r[0].precio, 'No disponible');
});

test(`devuelve como máximo ${MAX_RESULTADOS} resultados`, () => {
  const urls = Array.from({ length: 10 }, (_, i) => `https://m.com/${i}`);
  const r = filtrarResultados(urls.map((url) => item({ url })), sinFiltros, { urls: new Set(urls), imagenes: new Set() });
  assert.equal(r.length, MAX_RESULTADOS);
});

test(`recorta la descripción a ${MAX_PALABRAS_DESCRIPCION} palabras`, () => {
  const larga = Array.from({ length: 40 }, (_, i) => `p${i}`).join(' ');
  assert.equal(recortarDescripcion(larga).split(' ').length, MAX_PALABRAS_DESCRIPCION); // el "…" se pega a la última palabra
  assert.ok(recortarDescripcion(larga).endsWith('…'));
  assert.equal(recortarDescripcion('corta y limpia'), 'corta y limpia');
  assert.equal(recortarDescripcion(null), '');
});

test('el resultado tiene exactamente los campos acordados', () => {
  const r = filtrarResultados([item({ url: 'https://a.com/1' })], sinFiltros, fuentes);
  assert.deepEqual(Object.keys(r[0]).sort(), ['descripcion', 'imagen', 'nombre', 'precio', 'servicios', 'url']);
});

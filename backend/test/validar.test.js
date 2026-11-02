import test from 'node:test';
import assert from 'node:assert/strict';
import { validarFiltros } from '../lib/validar.js';

const base = { destino: 'Bariloche', huespedes: 2 };

test('acepta filtros válidos', () => {
  const r = validarFiltros({ ...base, precioMax: 100, checkIn: '2026-12-01', checkOut: '2026-12-05', servicios: ['wifi'] });
  assert.equal(r.error, undefined);
  assert.equal(r.valor.destino, 'Bariloche');
});
test('rechaza destino vacío, largo o con caracteres raros', () => {
  assert.ok(validarFiltros({ destino: '' }).error);
  assert.ok(validarFiltros({ destino: 'x'.repeat(81) }).error);
  assert.ok(validarFiltros({ destino: 'Roma <script>' }).error);
});
test('rechaza huéspedes fuera de 1-20', () => {
  assert.ok(validarFiltros({ ...base, huespedes: 0 }).error);
  assert.ok(validarFiltros({ ...base, huespedes: 21 }).error);
  assert.ok(validarFiltros({ ...base, huespedes: 1.5 }).error);
});
test('rechaza precio no positivo', () => {
  assert.ok(validarFiltros({ ...base, precioMax: -5 }).error);
  assert.ok(validarFiltros({ ...base, precioMax: 'abc' }).error);
});
test('valida fechas', () => {
  assert.ok(validarFiltros({ ...base, checkIn: '2026-12-01' }).error);
  assert.ok(validarFiltros({ ...base, checkIn: '2026-12-05', checkOut: '2026-12-01' }).error);
  assert.ok(validarFiltros({ ...base, checkIn: 'mañana', checkOut: 'pasado' }).error);
});
test('rechaza servicios desconocidos', () => {
  assert.ok(validarFiltros({ ...base, servicios: ['jacuzzi'] }).error);
});

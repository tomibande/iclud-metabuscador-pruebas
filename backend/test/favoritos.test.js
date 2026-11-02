// Tests de integración: corren contra una base de PRUEBAS (DATABASE_URL_TEST), nunca la de producción.
// Cada test limpia lo suyo, así no dependen del orden en que se ejecutan.
import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

import { execSync } from 'node:child_process';

// Base de PRUEBAS separada: un archivo propio, nunca la base de desarrollo ni la de producción.
// Se puede apuntar a otra con DATABASE_URL_TEST (por ejemplo, en el pipeline).
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST || 'file:./prisma/test.db';
process.env.JWT_SECRET ??= 'secreto-solo-para-tests';

// Crea las tablas antes de empezar. Se hace acá y no en un script de npm para que
// `npm test` funcione igual en Windows, Linux y Mac, sin sintaxis propia del shell.
execSync('npx prisma db push --skip-generate --accept-data-loss', {
  env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
  stdio: 'ignore',
});

const { crearApp } = await import('../server.js');
const { prisma } = await import('../lib/db.js');

let servidor, base;

before(() => {
  servidor = crearApp().listen(0);
  base = `http://127.0.0.1:${servidor.address().port}`;
});
after(async () => {
  servidor.close();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await prisma.favorito.deleteMany();
  await prisma.usuario.deleteMany();
});

// Guarda la cookie de sesión para mandarla en los pedidos siguientes.
async function registrarse(email = 'ana@ejemplo.com') {
  const r = await fetch(`${base}/api/auth/registro`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: 'Ana', email, password: 'clave-larga-123' }),
  });
  assert.equal(r.status, 201);
  return r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}

const pedir = (ruta, cookie, opciones = {}) => fetch(`${base}${ruta}`, {
  ...opciones,
  headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...opciones.headers },
});

const UNO = { nombre: 'Hostería del Ñire', precio: 'USD 82 por noche', url: 'https://ejemplo.test/nire', imagen: null };

test('sin sesión los favoritos responden 401', async () => {
  const r = await pedir('/api/favoritos', null);
  assert.equal(r.status, 401);
});

test('guarda el favorito con el precio tal cual lo publicó la fuente', async () => {
  const cookie = await registrarse();
  const alta = await pedir('/api/favoritos', cookie, { method: 'POST', body: JSON.stringify(UNO) });
  assert.equal(alta.status, 201);

  const { favoritos } = await (await pedir('/api/favoritos', cookie)).json();
  assert.equal(favoritos.length, 1);
  assert.equal(favoritos[0].precio, 'USD 82 por noche'); // el texto se conserva, no se convierte a número
  assert.equal(favoritos[0].nombreAlojamiento, 'Hostería del Ñire');
});

test('acepta "No disponible" como precio', async () => {
  const cookie = await registrarse();
  await pedir('/api/favoritos', cookie, { method: 'POST', body: JSON.stringify({ ...UNO, precio: 'No disponible' }) });
  const { favoritos } = await (await pedir('/api/favoritos', cookie)).json();
  assert.equal(favoritos[0].precio, 'No disponible');
});

test('no duplica el mismo alojamiento para el mismo usuario', async () => {
  const cookie = await registrarse();
  await pedir('/api/favoritos', cookie, { method: 'POST', body: JSON.stringify(UNO) });
  await pedir('/api/favoritos', cookie, { method: 'POST', body: JSON.stringify(UNO) });
  const { favoritos } = await (await pedir('/api/favoritos', cookie)).json();
  assert.equal(favoritos.length, 1);
});

test('rechaza URL que no sea http(s) con 400', async () => {
  const cookie = await registrarse();
  const r = await pedir('/api/favoritos', cookie, {
    method: 'POST', body: JSON.stringify({ ...UNO, url: 'javascript:alert(1)' }),
  });
  assert.equal(r.status, 400);
});

test('rechaza un precio que no sea texto con 400', async () => {
  const cookie = await registrarse();
  const r = await pedir('/api/favoritos', cookie, { method: 'POST', body: JSON.stringify({ ...UNO, precio: 82 }) });
  assert.equal(r.status, 400);
});

test('un usuario no puede borrar el favorito de otro', async () => {
  const cookieAna = await registrarse('ana@ejemplo.com');
  const alta = await pedir('/api/favoritos', cookieAna, { method: 'POST', body: JSON.stringify(UNO) });
  const { favorito } = await alta.json();

  const cookieBeto = await registrarse('beto@ejemplo.com');
  await pedir(`/api/favoritos/${favorito.id}`, cookieBeto, { method: 'DELETE' });

  // el favorito de Ana sigue ahí: el id del dueño sale del token, no del pedido
  const { favoritos } = await (await pedir('/api/favoritos', cookieAna)).json();
  assert.equal(favoritos.length, 1);
});

test('el dueño sí puede borrar su favorito', async () => {
  const cookie = await registrarse();
  const { favorito } = await (await pedir('/api/favoritos', cookie, { method: 'POST', body: JSON.stringify(UNO) })).json();
  const r = await pedir(`/api/favoritos/${favorito.id}`, cookie, { method: 'DELETE' });
  assert.equal(r.status, 200);
  const { favoritos } = await (await pedir('/api/favoritos', cookie)).json();
  assert.equal(favoritos.length, 0);
});

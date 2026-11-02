// Tests de integración de ROLES y cierre de sesión (checklist 4.4).
// Base de pruebas aislada en su propio schema.
import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBase, crearCliente } from './ayuda-integracion.js';

prepararBase('test_roles');

const { crearApp } = await import('../server.js');
const { prisma } = await import('../lib/db.js');

let servidor, base;
const { pedir, registrarse } = crearCliente(() => base);

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

// Un admin se designa en la base, no por la API. Como requiereAuth lee el rol
// de la base en cada pedido, el ascenso vale ya en el pedido siguiente.
async function volverAdmin(email) {
  await prisma.usuario.update({ where: { email }, data: { rol: 'admin' } });
}

test('quien se registra queda con rol usuario, nunca admin', async () => {
  const cookie = await registrarse();
  const { usuario } = await (await pedir('/api/auth/yo', cookie)).json();
  assert.equal(usuario.rol, 'usuario');
});

test('no se puede conseguir el rol admin mandándolo en el registro', async () => {
  // Intento de escalar privilegios: el rol del cuerpo del pedido se ignora.
  const cookie = await registrarse('viva@ejemplo.com', { rol: 'admin' });
  const { usuario } = await (await pedir('/api/auth/yo', cookie)).json();
  assert.equal(usuario.rol, 'usuario');
});

test('sin sesión el panel de admin responde 401', async () => {
  const r = await pedir('/api/admin/usuarios', null);
  assert.equal(r.status, 401);
});

test('un usuario común recibe 403 en el panel de admin', async () => {
  const cookie = await registrarse();
  const r = await pedir('/api/admin/usuarios', cookie);
  assert.equal(r.status, 403);
  assert.ok((await r.json()).error, 'el 403 tiene que explicar que falta permiso');
});

test('un admin ve la lista de usuarios con su cantidad de favoritos', async () => {
  const cookie = await registrarse('jefa@ejemplo.com');
  await pedir('/api/favoritos', cookie, {
    method: 'POST',
    body: JSON.stringify({ nombre: 'Cabaña del Sur', precio: 'ARS 96.400', url: 'https://ejemplo.test/sur' }),
  });
  await volverAdmin('jefa@ejemplo.com');

  const r = await pedir('/api/admin/usuarios', cookie);
  assert.equal(r.status, 200);
  const { usuarios } = await r.json();
  assert.equal(usuarios.length, 1);
  assert.equal(usuarios[0].cantidadFavoritos, 1);
  assert.equal(usuarios[0].rol, 'admin');
});

test('el panel de admin nunca expone el passwordHash', async () => {
  const cookie = await registrarse('jefa@ejemplo.com');
  await volverAdmin('jefa@ejemplo.com');
  const { usuarios } = await (await pedir('/api/admin/usuarios', cookie)).json();
  assert.equal(usuarios[0].passwordHash, undefined);
});

test('el logout invalida el token: la cookie vieja ya no sirve', async () => {
  const cookie = await registrarse();
  assert.equal((await pedir('/api/auth/yo', cookie)).status, 200);

  await pedir('/api/auth/logout', cookie, { method: 'POST' });

  // Acá está la diferencia con borrar la cookie: el token sigue firmado y sin vencer,
  // pero su versión ya no coincide con la del usuario, así que no vale más.
  const r = await pedir('/api/auth/yo', cookie);
  assert.equal(r.status, 401);
});

test('el logout de uno no cierra la sesión de otro', async () => {
  const cookieAna = await registrarse('ana@ejemplo.com');
  const cookieBeto = await registrarse('beto@ejemplo.com');

  await pedir('/api/auth/logout', cookieAna, { method: 'POST' });

  assert.equal((await pedir('/api/auth/yo', cookieAna)).status, 401);
  assert.equal((await pedir('/api/auth/yo', cookieBeto)).status, 200);
});

test('el logout sin sesión responde 200 igual (es idempotente)', async () => {
  const r = await pedir('/api/auth/logout', null, { method: 'POST' });
  assert.equal(r.status, 200);
});

// Apoyo común para los tests de integración.
//
// Corren contra una Postgres de PRUEBAS (DATABASE_URL_TEST), nunca la de producción.
// Cada archivo de test usa su propio SCHEMA dentro de esa base: así `node --test`
// puede ejecutarlos en paralelo sin que uno borre los datos del otro.
import { execSync } from 'node:child_process';

const AYUDA = [
  'Los tests de integración necesitan una Postgres de PRUEBAS.',
  'Definí DATABASE_URL_TEST antes de correr npm test. Por ejemplo, con Docker:',
  '',
  '  docker run --rm -d -p 5433:5432 -e POSTGRES_PASSWORD=postgres --name iclud-test postgres:16',
  '  export DATABASE_URL_TEST="postgresql://postgres:postgres@127.0.0.1:5433/postgres"',
  '  npm test',
  '',
  'NUNCA apuntes DATABASE_URL_TEST a la base de producción: los tests la vacían.',
].join('\n');

// Prepara el schema y deja DATABASE_URL apuntando a él.
// Se llama ANTES de importar server.js (con import dinámico), porque el cliente de
// Prisma lee DATABASE_URL al crearse.
export function prepararBase(schema) {
  if (!process.env.DATABASE_URL_TEST) throw new Error(AYUDA);

  const url = new URL(process.env.DATABASE_URL_TEST);
  url.searchParams.set('schema', schema);
  process.env.DATABASE_URL = url.toString();
  process.env.JWT_SECRET ??= 'secreto-solo-para-tests';

  // migrate deploy aplica las migraciones versionadas: así los tests prueban el
  // mismo SQL que va a correr en producción, y no un esquema improvisado.
  execSync('npx prisma migrate deploy', { env: { ...process.env }, stdio: 'ignore' });
}

// Cliente HTTP mínimo contra el servidor de pruebas.
export function crearCliente(obtenerBase) {
  const pedir = (ruta, cookie, opciones = {}) => fetch(`${obtenerBase()}${ruta}`, {
    ...opciones,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...opciones.headers,
    },
  });

  // Devuelve la cookie de sesión para reusarla en los pedidos siguientes.
  const registrarse = async (email = 'ana@ejemplo.com', extra = {}) => {
    const r = await pedir('/api/auth/registro', null, {
      method: 'POST',
      body: JSON.stringify({ nombre: 'Ana', email, password: 'clave-larga-123', ...extra }),
    });
    if (r.status !== 201) throw new Error(`el registro falló con ${r.status}`);
    return r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  };

  return { pedir, registrarse };
}

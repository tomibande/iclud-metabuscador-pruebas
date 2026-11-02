# ICLUD — Metabuscador de alojamientos

Plataforma web que busca alojamientos (hoteles, departamentos, hostels, cabañas) en varias
fuentes de internet al mismo tiempo y devuelve las ofertas en tarjetas, con el enlace a la
fuente original.

**El problema que resuelve:** al planificar un viaje la oferta está repartida entre muchas
plataformas, y compararlas a mano es lento. ICLUD hace una sola búsqueda y muestra los
resultados juntos.

---

## Cómo funciona

El usuario carga destino, fechas, huéspedes, precio máximo y servicios. El backend busca en
la web con **Tavily**, le pide a **Gemini** que convierta ese texto crudo en datos
estructurados, y antes de publicar nada **verifica** el resultado.

```
Navegador  ──fetch JSON──▶  Backend (Express)
                               ├──▶ Tavily   búsqueda web: texto crudo + URLs
                               ├──▶ Gemini   estructura el texto en JSON
                               └──▶ Postgres usuarios y favoritos
```

La idea central del diseño: **nada de lo que dice el modelo se publica sin verificar.**
`lib/filtrar.js` descarta todo resultado cuya URL no esté en el conjunto exacto de URLs que
devolvió Tavily. Si el modelo inventa un alojamiento, se cae ahí y nunca llega al usuario.

Las claves de las APIs viven **solo en el backend**: el navegador nunca habla con Tavily,
Gemini ni la base de datos.

### Qué se guarda y qué no

Los resultados de una búsqueda **no se guardan**. Cada búsqueda refleja la web en ese
momento, así nunca se muestran precios vencidos. Lo único que se persiste es lo que el
usuario marca como **favorito**, junto con su fecha de guardado.

---

## Puesta en marcha

Hace falta **Node.js 22.8 o superior** y una base **PostgreSQL**.

> La versión mínima la impone `npm test`: las opciones de umbral de cobertura
> (`--test-coverage-lines`) existen recién desde Node 22.8.

### 1. Instalar dependencias

```bash
cd backend && npm install
```

### 2. Configurar las variables de entorno

```bash
cp backend/.env.example backend/.env
```

Después completar `backend/.env`. **Nunca subir ese archivo al repositorio.**

| Variable | Obligatoria | Para qué sirve |
|---|---|---|
| `TAVILY_API_KEY` | sí | Clave de Tavily (empieza con `tvly-`) |
| `GEMINI_API_KEY` | sí | Clave de la API de Gemini |
| `GEMINI_MODEL` | sí | Modelo a usar. Verificar cuál es el *flash* vigente: la familia 1.5 está dada de baja y devuelve 404 |
| `DATABASE_URL` | sí | Cadena de conexión de Postgres |
| `JWT_SECRET` | sí | Secreto para firmar los tokens de sesión |
| `DATABASE_URL_TEST` | solo para tests | Postgres de **pruebas**. Los tests la vacían |
| `PORT` | no | Puerto del servidor (por defecto 3000) |
| `MONEDA_FILTRO` | no | Moneda con la que se pide el precio (por defecto USD) |
| `TAVILY_DEPTH` | no | `basic` en desarrollo, `advanced` en producción |
| `TAVILY_TIMEOUT_S` | no | Tiempo límite de Tavily, en **segundos** (por defecto 20) |
| `GEMINI_TIMEOUT_MS` | no | Tiempo límite de Gemini, en **milisegundos** (por defecto 25000) |

El servidor falla al arrancar si falta alguna obligatoria, y dice exactamente cuál.

### 3. Crear las tablas

```bash
cd backend && npm run db:deploy
```

### 4. Levantar el servidor

```bash
cd backend && npm run dev
```

Queda en http://localhost:3000 — el backend también sirve el frontend.

---

## Tests

```bash
cd backend && npm test
```

Un solo comando: corre los **45 tests** con reporte de cobertura y un **umbral del 65 % de
líneas**. Si la cobertura baja de ahí, el comando falla y el pipeline corta.

Los tests de integración necesitan `DATABASE_URL_TEST` apuntando a una Postgres de pruebas.
Si no tenés una a mano, con Docker:

```bash
docker run --rm -d -p 5433:5432 -e POSTGRES_PASSWORD=postgres --name iclud-test postgres:16
```

```bash
cd backend && DATABASE_URL_TEST="postgresql://postgres:postgres@127.0.0.1:5433/postgres" npm test
```

**Tavily y Gemini están siempre mockeados en los tests.** Correr los tests nunca gasta
créditos ni llama a las APIs reales.

---

## La API

| Método | Ruta | Acceso | Qué hace |
|---|---|---|---|
| `POST` | `/api/metabuscar` | público | Busca alojamientos. Devuelve un arreglo |
| `POST` | `/api/auth/registro` | público | Crea una cuenta e inicia sesión |
| `POST` | `/api/auth/login` | público | Inicia sesión |
| `POST` | `/api/auth/logout` | público | Cierra sesión e **invalida el token** |
| `GET` | `/api/auth/yo` | con sesión | Datos del usuario actual |
| `GET` | `/api/favoritos` | con sesión | Favoritos del usuario |
| `POST` | `/api/favoritos` | con sesión | Guarda un favorito |
| `DELETE` | `/api/favoritos/:id` | con sesión | Borra un favorito propio |
| `GET` | `/api/admin/usuarios` | **rol admin** | Lista usuarios y sus favoritos |

### Códigos de respuesta de `/api/metabuscar`

| Caso | Código | Cuerpo |
|---|---|---|
| Éxito | 200 | Arreglo de resultados (vacío si no hubo: eso no es un error) |
| Entrada inválida | 400 | `{ error }` con un mensaje claro |
| Demasiadas búsquedas | 429 | `{ error }` — límite de 10 por minuto por IP |
| Falla de Tavily o Gemini | 502 | `{ error }` genérico; el detalle va solo al log del servidor |

---

## Seguridad

- Contraseñas con **bcrypt**, factor de costo 12. Nunca se guardan ni se devuelven en claro.
- Sesión en un **JWT dentro de una cookie `httpOnly`**, que JavaScript no puede leer.
- **El logout invalida el token de verdad:** cada usuario tiene una versión de token; cerrar
  sesión la incrementa y todos los tokens anteriores dejan de valer, aunque no hayan vencido.
- **Dos niveles de acceso** (`usuario` y `admin`) con el rol guardado en la base, nunca
  deducido del nombre o del email. Sin permiso la respuesta es 403.
- Límite de pedidos por IP en la búsqueda (cada una gasta créditos) y en autenticación.
- Contra XSS, el frontend escapa todo lo que viene de internet y valida los enlaces antes de
  mostrarlos: nada de lo que devuelve la web se considera confiable.

---

## Estructura

```
backend/
├── server.js             crea la app y arranca el servidor
├── lib/
│   ├── env.js            carga backend/.env desde cualquier carpeta
│   ├── db.js             cliente de Prisma, se crea al primer uso
│   ├── validar.js        validación de los filtros de búsqueda
│   ├── filtrar.js        verifica los resultados del modelo y los recorta
│   └── asyncHandler.js   manda los errores async al manejador de Express
├── rutas/
│   ├── auth.js           registro, login, logout, sesión y roles
│   ├── favoritos.js      alta, baja y listado de favoritos
│   └── admin.js          sección de administración (rol admin)
├── servicios/
│   ├── tavily.js         búsqueda en la web
│   └── gemini.js         estructuración del texto en JSON
├── prisma/
│   ├── schema.prisma     modelos Usuario y Favorito
│   └── migrations/       migraciones versionadas
└── test/                 45 tests
frontend/
├── index.html            filtros, panel de resultados y modal de sesión
├── app.js                lógica de la interfaz
└── styles.css            estilos, modo oscuro
docs/                     DFD, casos de uso, DER, arquitectura y decisiones
```

Documentación técnica completa en [`docs/`](docs/).

---

## Equipo

Trabajo Práctico Integrador — E.T. N° 21 (CABA), 6° año, especialidad Computación, ciclo 2026.
Práctica Profesionalizante 21COM1.1 y Programación sobre Redes.

Jeremías Nehuén Belén · Tomás Valentín Bande Zucchi · Mateo Salvador Chazarreta ·
Santiago Ziegler · Demián Iván Medela · Santino Elihalte Giorgio

Células de Frontend y Backend.

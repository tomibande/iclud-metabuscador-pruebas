# CLAUDE.md — Proyecto ICLUD (metabuscador)

Contexto del proyecto para Claude Code. Leer entero antes de tocar código.
Estado verificado al 2 de noviembre de 2026, sobre el repo `tomibande/iclud-metabuscador-pruebas`.

---

## 1. Qué es ICLUD

Plataforma web de búsqueda de alojamientos (hoteles, departamentos, hostels, cabañas). Su rasgo
distintivo es un **metabuscador**: el usuario carga destino, fechas, huéspedes, precio máximo y
servicios, y el sistema busca ofertas en la web y las devuelve en tarjetas, con link a la fuente
original.

**Problema que resuelve:** al planificar un viaje la oferta está fragmentada en muchas plataformas
y comparar a mano es lento.

**Marco académico**
- Práctica Profesionalizante 21COM1.1 — 6° año, especialidad Computación.
- Trabajo Práctico Integrador de Programación sobre Redes, 6° 1ra, E.T. N° 21 (CABA), ciclo 2026.
- Período: mayo – octubre 2026.
- Equipo (6): Jeremías Nehuén Belén, Tomás Valentín Bande Zucchi, Mateo Salvador Chazarreta,
  Santiago Ziegler, Demián Iván Medela, Santino Elihalte Giorgio. Células Frontend y Backend.

**Nivel esperado:** secundaria técnica. En la defensa individual **cada integrante implementa un
feature en vivo sin IA sobre este código**. Priorizar código claro y explicable por sobre
soluciones ingeniosas. Comentar el *por qué* de lo no obvio, no el *qué*.

---

## 2. Alcance vigente

1. El alcance se acotó **al metabuscador**. Quedaron fuera los alojamientos propios con reservas,
   pagos con Stripe, panel de admin y catering.
2. **Favoritos** cubre el requisito de persistencia: el usuario guarda resultados con un botón en
   cada tarjeta. Eso reintrodujo autenticación y base de datos.
3. **Los resultados del metabuscador NO se persisten.** Cada búsqueda refleja la web en ese momento,
   así nunca se muestran precios vencidos. Solo se persiste lo que el usuario marca como favorito,
   con su fecha de guardado.

⚠️ Este repo es una **reescritura limpia**. No tiene nada del alcance anterior: no hay CRUD de
hoteles propios, ni reservas, ni catering, ni panel de admin. Si una tarea menciona
`catalogo.html`, `admin.html` o `vistas/`, está hablando del repo viejo
(`Alojamientos-Iclud/Metabuscador-ICLUD`), no de este.

---

## 3. Arquitectura

```
Frontend (hoy servido por el backend como estático)
   │  fetch JSON
   ▼
Backend Node.js + Express
   ├──► Tavily API  (@tavily/core)  → búsqueda web, texto crudo + URLs
   ├──► Gemini API  (@google/genai) → estructura el texto en JSON validado por esquema
   └──► Prisma + SQLite (local)     → usuarios y favoritos
```

El frontend **nunca** llama a Tavily, Gemini ni a la base: las claves viven solo en el backend.

### Flujo del metabuscador

```
POST /api/metabuscar { destino, checkIn, checkOut, huespedes, precioMax, servicios }
  → validarFiltros()            lib/validar.js      · 400 si algo está mal
  → buscarEnWeb()               servicios/tavily.js · texto crudo + Set de URLs e imágenes
  → estructurar()               servicios/gemini.js · JSON con responseSchema
  → filtrarResultados()         lib/filtrar.js      · verifica y recorta
  ← [{ nombre, precio, descripcion, url, servicios, imagen }]
```

**La idea central del diseño:** nada de lo que dice Gemini se publica sin verificar.
`lib/filtrar.js` descarta todo resultado cuya URL no esté en el `Set` exacto de URLs que devolvió
Tavily. Si el modelo inventa un alojamiento, se cae ahí. Lo mismo con las imágenes.

### Reglas del prompt a Gemini (innegociables)
- No inventar datos. Sin precio en el texto → `"No disponible"`.
- Copiar la URL de la fuente sin modificarla.
- Servicios solo si el texto los afirma explícitamente. Nunca suponerlos.
- Descartar lo que no sea alojamiento. Mejor 2 buenos que 6 dudosos.
- Máximo 6 resultados, descripción ≤ 25 palabras.

Las dos últimas están además **garantizadas por código** en `lib/filtrar.js`
(`MAX_RESULTADOS`, `recortarDescripcion()`), que es de donde el prompt interpola los números para
que no se desincronicen.

### Códigos de respuesta de `/api/metabuscar`
| Caso | Código | Cuerpo |
|---|---|---|
| Éxito | 200 | arreglo pelado (vacío si no hubo resultados: no es error) |
| Entrada inválida | 400 | `{ error }` con mensaje claro |
| Demasiadas búsquedas | 429 | `{ error }` (rate limit por IP, 10/min) |
| Falla de Tavily o Gemini | 502 | `{ error }` genérico; el detalle va solo al log |

### Notas de las APIs (ya resueltas, no volver atrás)
- SDK de Google: **`@google/genai`** con `ai.models.generateContent()`. NO `@google/generative-ai`
  ni `getGenerativeModel()` (sintaxis vieja que muestran casi todos los tutoriales).
- La familia Gemini 1.5 está dada de baja (404). El modelo va **siempre en `.env` como
  `GEMINI_MODEL`**, nunca hardcodeado. Verificar en la página de modelos cuál es el flash vigente.
- Tavily: `@tavily/core`, clave `tvly-...`, plan gratuito de 1.000 créditos/mes para 6 personas.
  **Su opción `timeout` va en SEGUNDOS, no en milisegundos** (el SDK hace `timeout * 1000`).
  `searchDepth: "basic"` en desarrollo, `"advanced"` en producción, por env.
- En tests, Tavily y Gemini se mockean siempre. Nunca gastar créditos en un test.
- `import './lib/env.js'` debe ser la primera línea del entrypoint.

---

## 4. Estado del código

```
backend/
├── server.js               crearApp() con servicios inyectables + arranque condicional
├── lib/
│   ├── env.js              carga backend/.env desde cualquier carpeta
│   ├── db.js               PrismaClient perezoso (Proxy): se crea al primer uso
│   ├── validar.js          validarFiltros() y SERVICIOS_VALIDOS
│   ├── filtrar.js          filtrarResultados(), recortarDescripcion(), MAX_RESULTADOS
│   └── asyncHandler.js     ah(): manda errores async al manejador de Express 4
├── rutas/
│   ├── auth.js             registro, login, logout, /yo, requiereAuth
│   └── favoritos.js        GET, POST, DELETE (todo filtrado por el usuario del token)
├── servicios/
│   ├── tavily.js           construirConsulta(), armarTextoCrudo(), buscarEnWeb()
│   └── gemini.js           estructurar() con responseSchema
├── prisma/schema.prisma    Usuario, Favorito
├── test/                   33 tests (ver abajo)
└── .env.example            sin valores
frontend/
├── index.html              formulario de filtros, panel de resultados, modal de auth
├── app.js                  esc(), urlSegura(), estados del panel, favoritos, sesión
└── styles.css              tokens de color, modo oscuro, prefers-reduced-motion
```

### Lo que ya está resuelto
- Metabuscador completo de punta a punta, con la forma de respuesta acordada.
- Auth real: bcrypt con cost 12, JWT en cookie `httpOnly`, `requiereAuth` que devuelve 401.
- Favoritos por usuario, único por `(usuario, url)`, con el precio **como texto**.
- Validación de entrada que devuelve 400 explícito, nunca 500.
- Tiempos límite en las dos APIs externas. 502 con mensaje genérico y detalle solo en el log.
- Rate limiting por IP en la búsqueda (cada una gasta créditos) y en auth.
- XSS: `esc()` y `urlSegura()` en el front. Todo lo que viene de la web se trata como no confiable.
- `.env.example` versionado y `.gitignore` que no tapa el ejemplo.

### Tests: 33 en verde, 87,97 % de líneas
```
cd backend && npm test
```
Un solo comando, con cobertura y **umbral de 65 % de líneas** (`--test-coverage-lines=65`).
Verificado que con un umbral mayor el comando sale con código 1, así el pipeline puede fallar.

- 25 unitarios: `construirConsulta`, `armarTextoCrudo`, validación de filtros (fechas, huéspedes,
  precio, servicios), corte en 6, recorte de descripción, forma exacta de los campos, detección de
  URLs inventadas, duplicados, y que no se llame a Gemini si la web no devolvió ninguna fuente.
- 8 de integración (`test/favoritos.test.js`) contra una **base de pruebas separada** que el propio
  test crea con `prisma db push` (así `npm test` anda igual en Windows, Linux y Mac). Cubren 401 sin
  sesión, alta 201, el precio conservado como texto, no duplicar, 400 por URL `javascript:`, 400 por
  precio no textual, y que un usuario no pueda borrar el favorito de otro.

---

## 5. Decisiones tomadas (no revertir sin hablar con el equipo)

1. **El 200 devuelve un arreglo pelado**, no `{ ok, resultados }`. Decisión del equipo.
2. **Sin `precioNumero` ni `moneda`.** Consecuencia aceptada: el backend **ya no puede verificar
   `precioMax`**, porque un precio de texto como `"ARS 96.400"` no es comparable con un número.
   Hoy el precio máximo es solo una pista en la consulta a Tavily. Si Gemini devuelve algo más caro,
   entra.
3. **`Favorito.precio` es `String?`, no `Float?`.** Se guarda el texto tal cual lo publicó la fuente
   (`"USD 82 por noche"`, `"No disponible"`). Convertirlo a número exigiría elegir una moneda y un
   formato que la fuente no dio, y eso es inventar un dato.
4. **Se mantiene el campo `imagen`** aunque no esté en los 5 campos del contrato original: ya existía
   y las tarjetas lo usan. Solo se acepta si la imagen vino realmente de la búsqueda.

---

## 6. Lo que falta, en orden de gravedad

1. **4.3 Persistencia remota — no cumple.** `schema.prisma` usa `provider = "sqlite"`. El checklist
   pide Postgres remota (elegida: Prisma Postgres). Falta también la carpeta `migrations/`:
   el proyecto nunca generó migraciones, se usa `npm run db:init`.
   Correr `git rm --cached backend/prisma/dev.db`: está commiteado y el `*.db` del `.gitignore` no
   lo saca solo.
2. **4.4 Roles — no cumple.** `Usuario` no tiene campo `rol`. Sin eso no hay dos niveles de acceso
   ni 403. Prohibido `if (usuario == "admin")`: el rol va persistido en la base.
   Además **el logout no invalida nada**: `res.clearCookie` borra la cookie del navegador, pero el
   JWT sigue válido 7 días. El checklist pide invalidación efectiva (versión de token en el usuario
   o lista de revocados).
3. **4.1 Frontend desacoplado — no cumple, y está acoplado a propósito.** Es HTML/CSS/JS vanilla sin
   build, y `server.js` lo sirve con `express.static`, con rutas relativas. Migrar a Vite arrastra
   tres cambios juntos: build propio, `VITE_API_URL` por configuración, y CORS con `credentials`.
   Ojo: la cookie es `sameSite: 'lax'`, que **deja de funcionar cross-site**.
4. **4.6 Despliegue y CI/CD — no existe.** No hay `.github/`. Falta pipeline que instale, buildee,
   corra tests con el umbral y despliegue solo si todo pasa, más **una ejecución fallida y su
   corrección** en el historial. Comparar 2 plataformas de deploy y documentar la elección.
5. **4.8 Repositorio.** No hay README. `main` no está protegida. Y hay un problema que no se arregla
   después: **un único commit squasheado de un solo autor**. El checklist pide commits de cada
   integrante con su usuario, distribuidos en el tiempo. Empezar ya.
6. **4.9 Documentación.** Falta `/docs`: DFD 0/1/2, casos de uso UML con narrativa de los 3
   principales, DER que coincida con la base real, diagrama de arquitectura y despliegue, y
   documento de decisiones técnicas (≤ 2 páginas, con declaración de uso de IA).

### Detalle menor pendiente
Borrar un favorito ajeno devuelve 200 aunque no borre nada (`deleteMany` con `where` filtrado por
usuario). Es seguro, pero según el checklist convendría 404.

---

## 7. Variables de entorno

Copiar `backend/.env.example` a `backend/.env` y completar. **Nunca commitear `.env`.**

| Variable | Obligatoria | Nota |
|---|---|---|
| `TAVILY_API_KEY` | sí | `tvly-...` |
| `GEMINI_API_KEY` | sí | |
| `GEMINI_MODEL` | sí | verificar el flash vigente; la familia 1.5 da 404 |
| `DATABASE_URL` | sí | |
| `JWT_SECRET` | sí | |
| `PORT` | no | 3000 |
| `MONEDA_FILTRO` | no | USD |
| `TAVILY_DEPTH` | no | `basic` en desarrollo, `advanced` en producción |
| `TAVILY_TIMEOUT_S` | no | 20 — **segundos** |
| `GEMINI_TIMEOUT_MS` | no | 25000 — **milisegundos** |

`server.js` falla rápido al arrancar y dice qué variable falta.

En una sesión de Claude Code en la nube, las claves se cargan en la configuración del entorno
(menú del entorno → Edit → Network secrets), no por chat. Requieren sesión nueva. Si las llamadas
salientes se rechazan, agregar `api.tavily.com` y `generativelanguage.googleapis.com` en
Network access → Allowed domains.

---

## 8. Cómo trabajar en este repo

- Código y comentarios en **español**.
- Cambios chicos y explicables. Cada integrante tiene que poder defender el código solo.
- Separar siempre Frontend / Backend al proponer cambios.
- Nunca commitear claves. Nunca correr tests contra la base de producción.
- `main` protegida: trabajar en ramas y abrir PR.
- Antes de cambios grandes (migración del front, esquema de la base), proponer el plan y esperar
  aprobación.
- Si una instrucción choca con el código que ya existe, **preguntar antes de asumir**. Ya pasó una
  vez: un pedido de "crear el metabuscador desde cero en archivos nuevos" habría duplicado una
  implementación que ya estaba completa.

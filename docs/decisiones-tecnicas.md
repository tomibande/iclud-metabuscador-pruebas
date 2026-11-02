# Decisiones técnicas

Proyecto ICLUD — metabuscador de alojamientos. E.T. N° 21, 6° año Computación, ciclo 2026.

Este documento registra las decisiones que no son obvias y, sobre todo, **qué se resignó al
tomarlas**. Las que no tienen un costo asumido no están acá.

---

## 1. Acotar el alcance al metabuscador

El proyecto empezó más grande: alojamientos propios con reservas, pagos, panel de
administración y catering. Se recortó todo eso para quedarse con el metabuscador, que es la
parte que resuelve un problema real y que ninguna materia anterior había cubierto.

**Costo asumido:** se perdieron los casos de uso de reserva y pago, que eran vistosos en una
demo. A cambio, lo que quedó está terminado y probado en lugar de haber seis cosas a medias.

## 2. No confiar en el modelo de lenguaje

Un modelo puede inventar datos que suenan verosímiles. Si publicáramos su respuesta tal cual,
el usuario vería hoteles que no existen con precios que nadie ofreció.

La solución no fue pedirle al modelo que no invente (eso ya está en el prompt, pero un prompt
no es una garantía), sino **verificarlo por código**: `lib/filtrar.js` descarta todo resultado
cuya URL no esté en el conjunto exacto de URLs que devolvió la búsqueda web. Un alojamiento
inventado no tiene URL real y se cae ahí. Lo mismo con las imágenes.

Los límites de 6 resultados y 25 palabras también están garantizados por código, y el prompt
interpola esos números desde el mismo archivo para que no se desincronicen.

**Costo asumido:** a veces se descartan resultados que podrían ser buenos. Se prefiere mostrar
dos alojamientos confiables antes que seis dudosos.

## 3. No guardar los resultados de las búsquedas

Cada búsqueda refleja la web en ese momento. Guardarlas haría más rápida la segunda consulta,
pero mostraría precios vencidos, que es exactamente el problema que el sistema viene a
resolver.

Solo se persiste lo que el usuario marca como favorito, con su fecha de guardado.

**Costo asumido:** cada búsqueda gasta un crédito de la API y tarda unos segundos. No hay
caché.

## 4. El precio se guarda como texto, no como número

Las fuentes publican precios en formatos y monedas distintos: `"USD 82 por noche"`,
`"ARS 96.400"`, `"No disponible"`. Convertirlos a número exigiría elegir una moneda y un tipo
de cambio que la fuente nunca dio, y eso sería inventar un dato.

**Costo asumido, y es el más caro de todos:** el backend **no puede verificar el filtro de
precio máximo**, porque un texto no se compara con un número. Hoy ese filtro funciona solo
como pista para la búsqueda web; si el modelo devuelve algo más caro, entra. Tampoco se pueden
ordenar los favoritos por precio. Se aceptó porque la alternativa era mostrar un número
inventado, y un dato falso es peor que un dato que no se puede ordenar.

## 5. La respuesta exitosa es un arreglo pelado

`POST /api/metabuscar` devuelve `[...]` y no `{ ok, resultados }`. Decisión del equipo: el
código de estado HTTP ya dice si salió bien, así que repetirlo en el cuerpo es redundante. Los
errores sí viajan como `{ error }`.

**Costo asumido:** si en el futuro hiciera falta devolver metadatos junto con los resultados
(cuántas fuentes se consultaron, por ejemplo), habría que cambiar la forma de la respuesta y
tocar el frontend.

## 6. Invalidar la sesión con una versión de token

Borrar la cookie en el logout no alcanza: el JWT sigue firmado y válido hasta que vence, así
que un token copiado antes de cerrar sesión seguiría funcionando siete días.

Había dos caminos: una tabla de tokens revocados, o un número de versión en el usuario. Se
eligió el número: el token lleva adentro la versión con la que se emitió, el logout incrementa
la de la base, y desde ahí los tokens viejos no coinciden. Un campo, ninguna tabla nueva y se
explica en una frase.

**Costo asumido:** el logout cierra las sesiones del usuario en **todos** sus dispositivos, no
solo en el navegador actual. Y cada pedido autenticado hace una consulta extra a la base para
comparar la versión. Para la escala de este proyecto, ninguno de los dos molesta.

## 7. El rol va persistido en la base y se lee en cada pedido

El rol (`usuario` o `admin`) es un campo de la tabla `Usuario`, con tipo enumerado. No se
deduce del nombre ni del email, y **no se puede pedir al registrarse**: quien se registra queda
siempre como `usuario`. Un admin se designa directamente en la base.

Además, `requiereAuth` lee el rol de la base y no del token: si a alguien le quitan el rol de
admin, lo pierde en el pedido siguiente sin esperar a que su token venza.

**Costo asumido:** no hay interfaz para ascender a un usuario a admin; hay que hacerlo con una
consulta SQL o con Prisma Studio.

## 8. El frontend está acoplado al backend, por ahora

Es HTML/CSS/JS sin framework ni build, y Express lo sirve con `express.static`. Todo el
proyecto se levanta con un comando y cualquier integrante puede leerlo sin aprender una
herramienta nueva.

Desacoplarlo arrastra tres cambios juntos: un build propio, la URL de la API por
configuración, y CORS con credenciales. Y uno escondido: la cookie de sesión es
`sameSite: 'lax'`, que **deja de funcionar** cuando el frontend vive en otro dominio; habría
que pasarla a `sameSite: 'none'` con `secure`, lo que exige HTTPS en ambos lados.

**Costo asumido, y es una deuda reconocida:** el proyecto no cumple el requisito de frontend
desacoplado. Se decidió no migrarlo faltando un día para la entrega, porque el cambio toca la
autenticación —que hoy funciona— y el riesgo de llegar con el login roto era mayor que el
beneficio. Queda documentado como el próximo paso, con los tres cambios ya identificados.

## 9. Postgres y migraciones versionadas

El proyecto arrancó con SQLite, que no requiere instalar nada. Se migró a PostgreSQL
administrada para cumplir con el requisito de persistencia remota, y se generaron migraciones
versionadas en `prisma/migrations/`, que antes no existían.

**Costo asumido:** los tests de integración ahora necesitan una Postgres de pruebas
(`DATABASE_URL_TEST`), y ya no corren con solo clonar el repositorio. El README explica cómo
levantar una con Docker en un comando. En el pipeline se usa una base descartable. Se perdió
algo de comodidad a cambio de probar contra el mismo motor que corre en producción, que es lo
que evita que un error de SQL aparezca recién en el despliegue.

---

## Declaración de uso de inteligencia artificial

Durante el desarrollo de este proyecto se usó **Claude Code** (Anthropic) como asistente de
programación. Corresponde declarar el alcance real de ese uso:

**En qué participó la IA:**
- Implementación del flujo del metabuscador y de los clientes de Tavily y Gemini.
- Migración de SQLite a PostgreSQL, generación de las migraciones versionadas e
  implementación del sistema de roles y de invalidación de sesiones.
- Escritura de la suite de 45 tests automatizados.
- Configuración del pipeline de integración continua.
- Redacción del README y de los documentos de esta carpeta, incluidos los diagramas.

**En qué participó el equipo:**
- Definición del problema, del alcance y de los casos de uso.
- Las decisiones de diseño registradas en este documento, en particular el recorte del
  alcance (1), la forma de la respuesta (5) y guardar el precio como texto (4).
- Elección de la plataforma de despliegue y configuración de las cuentas y credenciales.
- Revisión y aprobación de todo el código incorporado.

**Nuestra valoración:** la asistencia aceleró mucho la implementación, y el aprendizaje real
estuvo en decidir qué pedir, en discutir los costos de cada decisión y en entender el código
antes de aceptarlo. Las decisiones de este documento son del equipo; la escritura del código
que las implementa fue en gran medida asistida.

> **Nota para el equipo:** revisen esta sección y ajústenla a lo que efectivamente hizo cada
> uno antes de entregar. Declararla con precisión es parte de la consigna, y una declaración
> honesta se defiende; una que minimiza el uso, no.

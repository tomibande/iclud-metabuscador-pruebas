# Comparación de plataformas de despliegue

El proyecto necesita hospedar dos cosas: una **aplicación Node.js** que sirve el backend y el
frontend, y una **base PostgreSQL**. Se evaluaron dos plataformas.

> ⚠️ Los planes gratuitos y los precios de estos servicios cambian seguido. Los datos de
> capacidades de abajo son estables, pero **antes de decidir hay que verificar el plan
> gratuito vigente en la web de cada plataforma**. No tomar los límites de este documento
> como definitivos.

---

## Opción A — Render

| Aspecto | Evaluación |
|---|---|
| **Despliegue** | Conecta el repositorio de GitHub y reconstruye en cada push. También ofrece *deploy hooks*: una URL que se llama con POST para disparar el despliegue, que es lo que usa nuestro pipeline. |
| **Node.js** | Soporte directo. Se configuran el comando de build y el de arranque. |
| **PostgreSQL** | Ofrece base administrada propia. |
| **Variables de entorno** | Panel propio, con grupos reutilizables entre servicios. |
| **HTTPS** | Incluido y automático en el dominio que asigna. |
| **Plan gratuito** | Existe, con una limitación conocida e importante: el servicio **se suspende tras un rato sin tráfico** y el primer pedido después tarda bastante en responder. |
| **Documentación** | Clara y con ejemplos de Node + Postgres. |

## Opción B — Railway

| Aspecto | Evaluación |
|---|---|
| **Despliegue** | También conecta con GitHub y reconstruye en cada push. |
| **Node.js** | Soporte directo, con detección automática del tipo de proyecto. |
| **PostgreSQL** | Se agrega como servicio dentro del mismo proyecto, en un par de clics, y queda en la misma red interna que la aplicación. |
| **Variables de entorno** | Panel propio. Puede inyectar la URL de la base automáticamente en la aplicación. |
| **HTTPS** | Incluido y automático. |
| **Plan gratuito** | Funciona por **crédito de uso mensual** en lugar de suspender el servicio: mientras quede crédito, la aplicación responde sin demora. Al agotarse, se detiene. |
| **Documentación** | Buena, con buenas plantillas de inicio. |

---

## Comparación

| Criterio | Render | Railway |
|---|---|---|
| Facilidad de puesta en marcha | Buena | **Muy buena** |
| App + base en un mismo lugar | Sí, como dos servicios | **Sí, integrado en un proyecto** |
| Comportamiento del plan gratuito | Se suspende sin tráfico | **Se detiene al agotar el crédito** |
| Hook de despliegue para el pipeline | **Sí, documentado** | Se puede, por integración o API |
| Previsibilidad para una demo en vivo | Menor: puede haber demora | **Mayor, mientras quede crédito** |
| Material de ayuda para principiantes | **Mucho** | Bastante |

---

## Elección: **Render**

Se eligió Render por tres razones concretas:

1. **El *deploy hook* es exactamente lo que necesita nuestro pipeline.** Es una URL que se
   llama con un POST, lo que permite que GitHub Actions dispare el despliegue solo si los
   tests pasaron. Eso cumple el requisito de "desplegar únicamente si todo pasa" sin tener
   que escribir integraciones.
2. **Tiene más material para alguien que despliega por primera vez**, lo que importa en un
   equipo donde no todos administraron un servidor antes.
3. **La suspensión por inactividad es un problema manejable y conocido.** Para la defensa
   alcanza con entrar a la aplicación unos minutos antes para despertarla.

La base de datos **no** se toma de Render sino de **Prisma Postgres**, que es la que el
proyecto ya venía usando con Prisma y la que está configurada en `DATABASE_URL`.

### Riesgo asumido y cómo se mitiga

El riesgo real es la **demora del primer pedido** después de un rato sin uso, justo en una
demostración en vivo.

Mitigación: abrir la aplicación unos minutos antes de la defensa y hacer una búsqueda de
prueba. Si en el futuro molestara, Railway queda como alternativa evaluada y el cambio es
acotado, porque lo único específico de la plataforma es el hook de despliegue del pipeline.

### Qué queda por configurar

1. Crear el servicio web en Render apuntando al repositorio, con `backend` como directorio
   raíz, `npm ci` como build y `npm start` como arranque.
2. Cargar las variables de entorno de producción (ver
   [arquitectura.md](arquitectura.md#qué-hay-que-configurar-en-la-plataforma)).
3. Copiar el *deploy hook* y guardarlo en GitHub como el secret `RENDER_DEPLOY_HOOK`
   (Settings → Secrets and variables → Actions).
4. Correr `npm run db:deploy` apuntando a la base de producción, **antes** del primer
   despliegue.

// Orquesta el endpoint, valida entrada y devuelve siempre el mismo shape: { ok, resultados, error? }
// Flujo (DFD nivel 2): validar -> tavily.js -> gemini.js -> armar respuesta.
import './lib/env.js'; // tiene que ir primero: carga backend/.env
import express from 'express';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validarFiltros } from './lib/validar.js';
import { filtrarResultados } from './lib/filtrar.js';
import { ah } from './lib/asyncHandler.js';
import { buscarEnWeb } from './servicios/tavily.js';
import { estructurar } from './servicios/gemini.js';
import authRouter from './rutas/auth.js';
import favoritosRouter from './rutas/favoritos.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Los servicios se pueden reemplazar (así se prueba el endpoint sin gastar créditos).
export function crearApp({ buscar = buscarEnWeb, estructurarTexto = estructurar } = {}) {
  const app = express();
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());
  app.use(express.static(path.join(__dirname, '..', 'frontend')));

  // Cada búsqueda gasta créditos de Tavily: se limita por IP.
  const limitadorBusqueda = rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({ ok: false, resultados: [], error: 'Demasiadas búsquedas seguidas. Esperá un minuto.' }),
  });

  app.post('/metabuscar', limitadorBusqueda, ah(async (req, res) => {
    const { valor: filtros, error } = validarFiltros(req.body);
    if (error) return res.status(400).json({ ok: false, resultados: [], error });

    try {
      const { texto, urls, imagenes } = await buscar(filtros);
      if (urls.size === 0) return res.json({ ok: true, resultados: [] }); // 0 resultados no es un error

      const crudos = await estructurarTexto(texto, filtros);
      const moneda = (process.env.MONEDA_FILTRO || 'USD').toUpperCase();
      res.json({ ok: true, resultados: filtrarResultados(crudos, filtros, { urls, imagenes }, moneda) });
    } catch (e) {
      console.error('Fallo en /metabuscar:', e.message);
      res.status(502).json({
        ok: false,
        resultados: [],
        error: 'No pudimos completar la búsqueda en este momento. Probá de nuevo en unos minutos.',
      });
    }
  }));

  app.use('/api/auth', authRouter);
  app.use('/api/favoritos', favoritosRouter);

  // Manejador final: nunca devuelve HTML ni tira abajo el servidor
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status && err.status < 500 ? err.status : 500;
    if (status === 500) console.error(err);
    res.status(status).json({
      ok: false,
      resultados: [],
      error: status === 500 ? 'Error interno del servidor.' : 'Solicitud inválida.',
    });
  });

  return app;
}

// Solo arranca el servidor si se ejecuta este archivo directamente (no cuando lo importan los tests).
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  // RNF-06: configuración externalizada. Falla rápido y avisa qué falta.
  const faltan = ['TAVILY_API_KEY', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'JWT_SECRET', 'DATABASE_URL'].filter((k) => !process.env[k]);
  if (faltan.length) {
    console.error(`Faltan variables en backend/.env: ${faltan.join(', ')}`);
    process.exit(1);
  }
  const port = process.env.PORT || 3000;
  crearApp().listen(port, () => console.log(`ICLUD metabuscador en http://localhost:${port}`));
}

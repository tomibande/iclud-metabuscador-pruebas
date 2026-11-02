import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/db.js';
import { ah } from '../lib/asyncHandler.js';

const router = Router();
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const limitador = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

// Datos públicos del usuario: nunca se devuelve el passwordHash.
const vistaPublica = (u) => ({ id: u.id, nombre: u.nombre, rol: u.rol });

function iniciarSesion(res, usuario) {
  // La versión del token viaja DENTRO del token: así el servidor puede detectar
  // después que esta sesión fue cerrada, comparándola con la que guarda la base.
  const token = jwt.sign(
    { id: usuario.id, rol: usuario.rol, v: usuario.versionToken },
    process.env.JWT_SECRET,
    { expiresIn: '7d' },
  );
  res.cookie('sesion', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

// Exige sesión válida. Además de verificar la firma del JWT, confirma contra la base
// que la sesión no haya sido cerrada: el logout incrementa versionToken y entonces
// la versión que trae el token deja de coincidir. Sin esta consulta, un token robado
// seguiría sirviendo los 7 días completos aunque el usuario cerrara sesión.
export const requiereAuth = ah(async (req, res, next) => {
  let datos;
  try {
    datos = jwt.verify(req.cookies?.sesion, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Iniciá sesión para continuar.' });
  }

  const usuario = await prisma.usuario.findUnique({
    where: { id: datos.id },
    select: { id: true, rol: true, versionToken: true },
  });
  if (!usuario || usuario.versionToken !== datos.v) {
    return res.status(401).json({ error: 'Tu sesión se cerró. Iniciá sesión de nuevo.' });
  }

  req.usuarioId = usuario.id;
  // El rol se lee de la BASE, no del token: si un admin pierde el rol, deja de
  // tenerlo en el próximo pedido sin esperar a que el token venza.
  req.usuarioRol = usuario.rol;
  next();
});

// Segundo nivel de acceso. Se usa SIEMPRE después de requiereAuth.
export function requiereRol(...rolesPermitidos) {
  return (req, res, next) => {
    if (!rolesPermitidos.includes(req.usuarioRol)) {
      return res.status(403).json({ error: 'No tenés permiso para entrar a esta sección.' });
    }
    next();
  };
}

router.post('/registro', limitador, ah(async (req, res) => {
  const nombre = String(req.body?.nombre ?? '').trim();
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  if (!nombre || nombre.length > 60) return res.status(400).json({ error: 'Ingresá un nombre de hasta 60 caracteres.' });
  if (!RE_EMAIL.test(email) || email.length > 120) return res.status(400).json({ error: 'Email inválido.' });
  if (password.length < 8 || password.length > 72) return res.status(400).json({ error: 'La contraseña debe tener entre 8 y 72 caracteres.' });

  try {
    // El rol NO se toma del pedido: quien se registra siempre queda como "usuario"
    // (el default del esquema). Un admin se designa en la base, no por la API.
    const usuario = await prisma.usuario.create({
      data: { nombre, email, passwordHash: await bcrypt.hash(password, 12) },
    });
    iniciarSesion(res, usuario);
    res.status(201).json({ usuario: vistaPublica(usuario) });
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Ese email ya está registrado.' });
    throw e;
  }
}));

router.post('/login', limitador, ah(async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  const usuario = await prisma.usuario.findUnique({ where: { email } });
  const ok = usuario && (await bcrypt.compare(password, usuario.passwordHash));
  if (!ok) return res.status(401).json({ error: 'Email o contraseña incorrectos.' });
  iniciarSesion(res, usuario);
  res.json({ usuario: vistaPublica(usuario) });
}));

// Cierra la sesión de verdad: borrar la cookie solo afecta a este navegador,
// incrementar versionToken invalida TODOS los tokens emitidos hasta ahora.
// Responde 200 incluso sin sesión válida, para que el frontend no tenga que distinguir.
router.post('/logout', ah(async (req, res) => {
  try {
    const { id } = jwt.verify(req.cookies?.sesion, process.env.JWT_SECRET);
    await prisma.usuario.update({ where: { id }, data: { versionToken: { increment: 1 } } });
  } catch {
    // Sin token válido no hay nada que invalidar.
  }
  res.clearCookie('sesion');
  res.json({ ok: true });
}));

router.get('/yo', requiereAuth, ah(async (req, res) => {
  const u = await prisma.usuario.findUnique({ where: { id: req.usuarioId } });
  if (!u) return res.status(401).json({ error: 'Sesión inválida.' });
  res.json({ usuario: vistaPublica(u) });
}));

export default router;

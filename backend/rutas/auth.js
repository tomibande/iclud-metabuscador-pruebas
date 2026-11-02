import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/db.js';
import { ah } from '../lib/asyncHandler.js';

const router = Router();
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const limitador = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

function iniciarSesion(res, usuario) {
  const token = jwt.sign({ id: usuario.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.cookie('sesion', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function requiereAuth(req, res, next) {
  try {
    req.usuarioId = jwt.verify(req.cookies.sesion, process.env.JWT_SECRET).id;
    next();
  } catch {
    res.status(401).json({ error: 'Iniciá sesión para continuar.' });
  }
}

router.post('/registro', limitador, ah(async (req, res) => {
  const nombre = String(req.body?.nombre ?? '').trim();
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  if (!nombre || nombre.length > 60) return res.status(400).json({ error: 'Ingresá un nombre de hasta 60 caracteres.' });
  if (!RE_EMAIL.test(email) || email.length > 120) return res.status(400).json({ error: 'Email inválido.' });
  if (password.length < 8 || password.length > 72) return res.status(400).json({ error: 'La contraseña debe tener entre 8 y 72 caracteres.' });

  try {
    const usuario = await prisma.usuario.create({
      data: { nombre, email, passwordHash: await bcrypt.hash(password, 12) },
    });
    iniciarSesion(res, usuario);
    res.status(201).json({ usuario: { id: usuario.id, nombre: usuario.nombre } });
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
  res.json({ usuario: { id: usuario.id, nombre: usuario.nombre } });
}));

router.post('/logout', (_req, res) => {
  res.clearCookie('sesion');
  res.json({ ok: true });
});

router.get('/yo', requiereAuth, ah(async (req, res) => {
  const u = await prisma.usuario.findUnique({ where: { id: req.usuarioId } });
  if (!u) return res.status(401).json({ error: 'Sesión inválida.' });
  res.json({ usuario: { id: u.id, nombre: u.nombre } });
}));

export default router;

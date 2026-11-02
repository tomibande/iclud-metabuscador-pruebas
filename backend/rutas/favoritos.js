import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { ah } from '../lib/asyncHandler.js';
import { requiereAuth } from './auth.js';

const router = Router();
router.use(requiereAuth);

const urlHttp = (v) => {
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

router.get('/', ah(async (req, res) => {
  const favoritos = await prisma.favorito.findMany({
    where: { idUsuario: req.usuarioId },
    orderBy: { fechaGuardado: 'desc' },
  });
  res.json({ favoritos });
}));

router.post('/', ah(async (req, res) => {
  const { nombre, precio, url, imagen } = req.body ?? {};
  if (typeof nombre !== 'string' || !nombre.trim() || nombre.length > 200) return res.status(400).json({ error: 'Nombre inválido.' });
  if (typeof url !== 'string' || url.length > 2000 || !urlHttp(url)) return res.status(400).json({ error: 'URL inválida.' });
  if (imagen != null && (typeof imagen !== 'string' || imagen.length > 2000 || !urlHttp(imagen))) return res.status(400).json({ error: 'Imagen inválida.' });
  const precioNum = precio == null ? null : Number(precio);
  if (precioNum !== null && (!Number.isFinite(precioNum) || precioNum < 0)) return res.status(400).json({ error: 'Precio inválido.' });

  const favorito = await prisma.favorito.upsert({
    where: { idUsuario_urlOrigen: { idUsuario: req.usuarioId, urlOrigen: url } },
    update: {},
    create: { idUsuario: req.usuarioId, nombreAlojamiento: nombre.trim(), precio: precioNum, urlOrigen: url, imagenUrl: imagen ?? null },
  });
  res.status(201).json({ favorito });
}));

router.delete('/:id', ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Id inválido.' });
  await prisma.favorito.deleteMany({ where: { id, idUsuario: req.usuarioId } });
  res.json({ ok: true });
}));

export default router;

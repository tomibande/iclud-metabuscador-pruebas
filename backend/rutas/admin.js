// Sección de administración: el segundo nivel de acceso del checklist (4.4).
// Todo lo de acá exige sesión Y rol admin; un usuario común recibe 403.
import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { ah } from '../lib/asyncHandler.js';
import { requiereAuth, requiereRol } from './auth.js';

const router = Router();
// El orden importa: primero se sabe QUIÉN es (401 si no hay sesión),
// después si TIENE PERMISO (403 si el rol no alcanza).
router.use(requiereAuth, requiereRol('admin'));

// Panel de usuarios: cuántos favoritos guardó cada uno.
// Se eligió "select" en lugar de traer el usuario completo para que el passwordHash
// no pueda escaparse por la API ni por accidente.
router.get('/usuarios', ah(async (_req, res) => {
  const usuarios = await prisma.usuario.findMany({
    select: {
      id: true,
      nombre: true,
      email: true,
      rol: true,
      fechaRegistro: true,
      _count: { select: { favoritos: true } },
    },
    orderBy: { fechaRegistro: 'asc' },
  });

  res.json({
    usuarios: usuarios.map(({ _count, ...u }) => ({ ...u, cantidadFavoritos: _count.favoritos })),
  });
}));

export default router;

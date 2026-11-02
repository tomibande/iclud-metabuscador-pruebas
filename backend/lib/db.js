import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// El cliente se crea la primera vez que se usa, no al importar el archivo.
// Si falta "prisma generate", el error aparece recién al usar la base y dice qué hacer.
let cliente;
export const prisma = new Proxy({}, {
  get: (_, propiedad) => {
    cliente ??= new (require('@prisma/client').PrismaClient)();
    return cliente[propiedad];
  },
});

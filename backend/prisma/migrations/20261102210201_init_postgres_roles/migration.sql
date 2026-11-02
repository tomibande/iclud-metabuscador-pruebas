-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('usuario', 'admin');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rol" "Rol" NOT NULL DEFAULT 'usuario',
    "versionToken" INTEGER NOT NULL DEFAULT 0,
    "fechaRegistro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorito" (
    "id" SERIAL NOT NULL,
    "idUsuario" INTEGER NOT NULL,
    "nombreAlojamiento" TEXT NOT NULL,
    "precio" TEXT,
    "urlOrigen" TEXT NOT NULL,
    "imagenUrl" TEXT,
    "fechaGuardado" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorito_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Favorito_idUsuario_urlOrigen_key" ON "Favorito"("idUsuario", "urlOrigen");

-- AddForeignKey
ALTER TABLE "Favorito" ADD CONSTRAINT "Favorito_idUsuario_fkey" FOREIGN KEY ("idUsuario") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

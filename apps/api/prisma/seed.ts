import { PrismaClient } from '@prisma/client';

/**
 * Seed opcional del MVP.
 *
 * Si existe `ADMIN_EMAIL` en el entorno, asegura que ese usuario exista y tenga
 * rol `admin` (lo crea si no existe). No hace nada si la variable no está.
 *
 * Ejecutar: `bun run seed` (o `bunx prisma db seed`).
 * NO correr contra producción sin confirmación.
 */
async function main(): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    // eslint-disable-next-line no-console
    console.log('[seed] ADMIN_EMAIL no definido: no se realizan cambios.');
    return;
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.upsert({
      where: { email: adminEmail },
      update: { role: 'admin' },
      create: {
        email: adminEmail,
        role: 'admin',
        name: adminEmail.split('@')[0] ?? adminEmail,
      },
    });
    // eslint-disable-next-line no-console
    console.log(`[seed] usuario ${user.email} asegurado como admin (id=${user.id}).`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[seed] error:', err);
  process.exit(1);
});

---
description: Despliega ticketera en Vercel (preview o producción) tras validar build, Prisma generate/migrate y variables de entorno.
agent: devops
---

# Deploy a Vercel

Despliega el monorepo ticketera en Vercel. Pasos:

1. Verifica que `prisma generate` y el build de `apps/web` y `apps/api` funcionan localmente.
2. Confirma con el usuario que las variables de entorno de Vercel están configuradas (DATABASE_URL de Neon, AUTH_SECRET, AUTH_URL, NEXT_PUBLIC_API_URL). El usuario provee los valores reales.
3. Ejecuta el despliegue:
   - Preview: `vercel`
   - Producción: `vercel --prod`
4. Después del deploy, corre `prisma migrate deploy` contra Neon (o asegura que el build del API lo haga).
5. Reporta la URL y el estado (verde/rojo) al orquestador.

Argumentos del usuario: $ARGUMENTS

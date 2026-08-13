# Diseño de Autenticación: Email+Contraseña (Credentials)

> **Estado:** Especificación para implementación (backend `apps/api`, frontend `apps/web`, devops).
> **Stack:** NestJS (serverless Vercel) + Next.js App Router + Neon Postgres/Prisma + Auth.js v5.
> **Gestor:** Bun. TypeScript estricto, sin `any`.
> **Alcance:** Añadir registro/login con email+contraseña manteniendo GitHub, con toggle en `/login`.

---

## 1. Decisiones de arquitectura (no negociables)

1. **La API NO emite JWT.** `/auth/login` y `/auth/register` son endpoints de
   **verificación/provisioning** puros: validan credenciales y devuelven el
   `SessionUser`. El JWT de sesión lo sigue firmando **Auth.js en el Web** con
   `AUTH_SECRET`, y el Web lo envía como `Bearer` a través del proxy a la API,
   que lo verifica con el mismo `AUTH_SECRET` (flujo existente, ver
   `jwt-auth.guard.ts`). No duplicamos emisión de tokens.
2. **`passwordHash` es nullable** en `User` porque los usuarios de GitHub no
   tienen contraseña. La presencia de `passwordHash` distingue una cuenta de
   credenciales de una de OAuth.
3. **Un email = un User.** Registro con un email ya existente (sea GitHub o
   credenciales) devuelve `EMAIL_ALREADY_EXISTS` (409). No se permite "adueñarse"
   de una cuenta GitHub existente mediante registro de contraseña (sin verificación
   de email aún). Esto evita takeover de cuentas en v1.
4. **El rol por defecto es `usuario`** en registro y en `sync`. El rol real
   siempre se lee de la DB en el guard (nunca se confía en el rol del JWT).
5. **`sync` nunca sobrescribe `passwordHash`.** El upsert de `sync` (usado por el
   flujo GitHub) solo actualiza `name`/`image` en la rama `update`; la rama
   `create` no setea `passwordHash`.

---

## 2. Cambio de esquema Prisma

**Archivo:** `apps/api/prisma/schema.prisma` — modelo `User`.

Añadir exactamente este campo (nullable, sin default):

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  name         String?
  image        String?
  passwordHash String?   // <-- NUEVO: solo para cuentas de credenciales.
  role         Role     @default(usuario)
  createdAt    DateTime @default(now())
  // ... resto de relaciones sin cambios
}
```

`Role`, `Account`, `Session`, `VerificationToken` y las relaciones de dominio
quedan iguales. No se crean nuevos modelos.

### 2.1 Generar la migración SIN aplicarla

> NO ejecutar `prisma migrate dev` contra Neon. El deploy lo hace devops con
> aprobación usando `prisma migrate deploy`.

Comando principal (crea el archivo de migración pero **no lo aplica**):

```bash
bunx prisma migrate dev --create-only --name add_password_hash
```

Requiere `DATABASE_URL` alcanzable (Neon) para el shadow database. Si no hay
conexión disponible en local, devops puede aplicar el siguiente SQL manualmente
en Neon (es idempotente y es exactamente lo que genera la migración):

```sql
-- up
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;

-- down (rollback)
ALTER TABLE "User" DROP COLUMN "passwordHash";
```

Aplicación en producción (a cargo de devops, tras aprobación):

```bash
bunx prisma migrate deploy
```

Después de cualquier cambio de schema: `bunx prisma generate`.

---

## 3. Códigos de error nuevos

**Archivo:** `apps/api/src/common/errors/error-codes.ts` — añadir al objeto
`ErrorCodes` (mantener sincronizado con `docs/api-contract.md`):

```ts
// Auth / credenciales
EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
WEAK_PASSWORD: 'WEAK_PASSWORD',
INVALID_EMAIL: 'INVALID_EMAIL',
INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
```

| Código | HTTP | Cuándo se lanza |
|--------|------|-----------------|
| `EMAIL_ALREADY_EXISTS` | 409 | El email ya existe en `User` (GitHub o credenciales). |
| `WEAK_PASSWORD` | 400 | `password` < 8 chars o no cumple el formato mínimo (service-layer). |
| `INVALID_EMAIL` | 400 | Reservado para política de email (p.ej. dominio no permitido). En v1 el formato lo cubre el DTO `IsEmail` → `VALIDATION_ERROR`. Definido para no romper contrato futuro. |
| `INVALID_CREDENTIALS` | 401 | Email no existe **o** password no coincide. Mensaje genérico, **sin revelar** cuál de los dos falló. |

Se lanzan con `new AppError(ErrorCodes.X, 'mensaje', HttpStatus.Y)` (helper ya
existente). El `AllExceptionsFilter` los normaliza al formato
`{ error: { code, message, details? } }`.

---

## 4. DTOs y tipos compartidos (`packages/types`)

**Archivo:** `packages/types/src/index.ts` (y su reflejo en `index.d.ts`) —
añadir los DTOs de entrada. Las respuestas de login/registro reutilizan
`SessionUser` (ya define `id, email, name?, image?, role`).

```ts
// --- Auth: credenciales ---
export interface RegisterDto {
  name: string;     // 1..100 chars
  email: string;    // email válido
  password: string; // >=8 chars, formato mínimo
}

export interface LoginDto {
  email: string;
  password: string;
}

// Respuesta de /auth/login y /auth/register (envuelta en { data }):
//   LoginResponse = SessionUser
export type LoginResponse = SessionUser;
export type RegisterResponse = SessionUser;
```

En el backend, los DTOs `class-validator` viven en
`apps/api/src/auth/dto/auth.dto.ts` (ver §6). Los tipos de `packages/types` son
la fuente de verdad consumida por el Web (Auth.js `authorize` tipa el body de
respuesta como `LoginResponse`).

---

## 5. Contrato de rutas (API)

Prefijo global ya configurado: **`/api/v1`**. Todas las respuestas exitosas
quedan envueltas por `ResponseTransformInterceptor` en `{ "data": <payload> }`.
Los errores quedan en `{ "error": { "code", "message", "details?" } }`.

| Método | Ruta | Auth (Bearer) | Body | 200/201 | Errores posibles |
|--------|------|---------------|------|---------|------------------|
| `POST` | `/api/v1/auth/register` | **Pública** | `RegisterDto` | `201` + `SessionUser` | `VALIDATION_ERROR` (400), `WEAK_PASSWORD` (400), `EMAIL_ALREADY_EXISTS` (409) |
| `POST` | `/api/v1/auth/login` | **Pública** | `LoginDto` | `200` + `SessionUser` | `VALIDATION_ERROR` (400), `INVALID_CREDENTIALS` (401) |
| `POST` | `/api/v1/users/sync` | Bearer (existente) | `RequestUser` | `200` + `SessionUser` | (sin cambios; ver §7) |

### 5.1 `POST /api/v1/auth/register`

- **Request body:**
  ```json
  { "name": "Ada Lovelace", "email": "ada@example.com", "password": "Str0ngPass" }
  ```
- **Éxito `201`:**
  ```json
  { "data": { "id": "clxxx", "email": "ada@example.com", "name": "Ada Lovelace", "image": null, "role": "usuario" } }
  ```
- **Reglas de validación:**
  1. DTO (global `ValidationPipe`, `whitelist`+`forbidNonWhitelisted`): `name` `IsString` no vacío, `email` `IsEmail`, `password` `IsString` no vacío. Fallo → `400 VALIDATION_ERROR` con `details` de campos.
  2. Service `register`:
     - Si existe `User` con ese `email` → `409 EMAIL_ALREADY_EXISTS` ("El email ya está registrado").
     - Si `password.length < 8` **o** `!/(?=.*[A-Za-z])(?=.*\d)/.test(password)` → `400 WEAK_PASSWORD` ("La contraseña debe tener al menos 8 caracteres e incluir letras y números").
  3. Creación: `role: 'usuario'`, `passwordHash: await bcrypt.hash(password, 10)`, `image: null`. No se crea `Account` (es flujo de credenciales, no OAuth).
- **Nunca** devuelve `passwordHash` ni lo incluye en `SessionUser`.

### 5.2 `POST /api/v1/auth/login`

- **Request body:**
  ```json
  { "email": "ada@example.com", "password": "Str0ngPass" }
  ```
- **Éxito `200`:**
  ```json
  { "data": { "id": "clxxx", "email": "ada@example.com", "name": "Ada Lovelace", "image": null, "role": "usuario" } }
  ```
- **Reglas:**
  1. DTO: `email` `IsEmail`, `password` `IsString` no vacío. Fallo → `400 VALIDATION_ERROR`.
  2. Service `login`:
     - Busca `User` por `email`. Si no existe **o** `passwordHash` es `null` (cuenta GitHub sin contraseña) → `401 INVALID_CREDENTIALS` ("Credenciales inválidas").
     - `bcrypt.compare(password, user.passwordHash)`. Si no coincide → `401 INVALID_CREDENTIALS`.
     - Éxito → devuelve `SessionUser` (`toSessionUser`).
- **Mensaje genérico** en ambos fallos (no diferenciar "email no existe" de
  "password incorrecta") para evitar enumeración de cuentas.

---

## 6. Módulo Auth ampliado (backend)

Archivos a crear/modificar (solo especificación; la implementación la hace
`backend`):

- **`apps/api/src/auth/dto/auth.dto.ts`** — DTOs `class-validator`:
  ```ts
  import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

  export class RegisterDto {
    @IsString() @MaxLength(100)
    name!: string;

    @IsEmail()
    email!: string;

    @IsString() @MinLength(8)
    @Matches(/(?=.*[A-Za-z])(?=.*\d)/, { message: 'weak password format' })
    password!: string;
  }

  export class LoginDto {
    @IsEmail()
    email!: string;

    @IsString()
    password!: string;
  }
  ```
  > Nota: el `@Matches` de `password` es redundante con la validación de
  > servicio de `WEAK_PASSWORD`, pero añade defensa en profundidad. El service
  > sigue lanzando `WEAK_PASSWORD` con mensaje en español; si se prefiere que el
  > DTO sea la única fuente, se puede quitar el `@Matches` y validar solo en
  > servicio. **Decisión recomendada:** dejar DTO mínimo (`IsString`/`IsEmail`/
  > `MinLength(8)`) y validar el formato letra+dígito en el service para emitir
  > `WEAK_PASSWORD` explícito.

- **`apps/api/src/auth/auth.service.ts`** — `AuthService`:
  - Depende de `PrismaService` y `UsersService` (importa `UsersModule`).
  - `register(dto: RegisterDto): Promise<SessionUser>` (lógica de §5.1).
  - `login(dto: LoginDto): Promise<SessionUser>` (lógica de §5.2).
  - Usa `bcryptjs` (`hash`/`compare`), **no** `bcrypt` nativo (incompatible
    limpio con Vercel serverless). `saltRounds = 10`.

- **`apps/api/src/auth/auth.controller.ts`** — `@Controller('auth')` (ruta base
  → `/api/v1/auth`), **sin** `@UseGuards` (público):
  - `@Post('register')` → `201`, llama `authService.register`.
  - `@Post('login')` → `200`, llama `authService.login`.
  - Ambos usan `ValidationPipe` global; tipan respuesta como `SessionUser`.

- **`apps/api/src/auth/auth.module.ts`** — se amplía el módulo existente
  (`@Global` para los guards). Añadir:
  ```ts
  @Global()
  @Module({
    imports: [JwtModule.register({...}), UsersModule], // <-- agregar UsersModule
    controllers: [AuthController],                     // <-- nuevo
    providers: [JwtAuthGuard, RolesGuard, AdminGuard, AgentGuard, AuthService], // <-- AuthService
    exports: [JwtAuthGuard, RolesGuard, AdminGuard, AgentGuard, JwtModule],
  })
  export class AuthModule {}
  ```
  > `UsersModule` debe exportar `UsersService`. Verificar que ya lo hace; si no,
  > añadir `exports: [UsersService]`.

### 6.1 Dependencias a instalar (backend)

```bash
bun add bcryptjs
bun add -d @types/bcryptjs
# Recomendado (rate limit, ver §9):
bun add @nestjs/throttler
```

---

## 7. Ajuste de `UsersService.sync` (apps/api/src/users/users.service.ts)

Contrato de `sync(user: RequestUser): Promise<SessionUser>` (flujo GitHub):

1. Si `user.id` presente → `findUnique({ where: { id } })`. Si existe, devolver `toSessionUser` (no tocar `passwordHash`).
2. Si no por `id`, y `user.email` presente → `findUnique({ where: { email } })`. Si existe, devolver (no tocar `passwordHash`).
3. Si no existe en ninguno → `upsert`:
   - `where: { email: user.email }`
   - `update: { name: user.name ?? null, image: user.image ?? null }`  ← **NUNCA** incluir `passwordHash` aquí.
   - `create: { id: user.id || undefined, email: user.email, name: user.name ?? null, image: user.image ?? null, role: 'usuario' }` ← **NUNCA** setear `passwordHash` (cuenta OAuth).
4. Devolver `toSessionUser`.

Esto garantiza que el login con credenciales (§5.2) y el `sync` de GitHub no
crean filas duplicadas para el mismo email, y que una cuenta de credenciales no
pierda su `passwordHash` si luego hace `sync` (p.ej. tras iniciar sesión con
GitHub usando el mismo email en el futuro — bloqueado en v1 por §3, pero el
código debe ser defensivo).

---

## 8. Integración Auth.js (apps/web/src/auth.ts)

Mantener `GitHub`. Añadir `CredentialsProvider` con `authorize` que consume la
API. **Detalle crítico:** la API envuelve las respuestas exitosas en
`{ data: ... }`, por lo que `authorize` debe leer `json.data`, no `json` directo.

```ts
import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import Credentials from 'next-auth/providers/credentials';
import type { Role, SessionUser } from '@ticketera/types';

const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:3001';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub,
    Credentials({
      name: 'Email y contraseña',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Contraseña', type: 'password' },
      },
      // authorize recibe { email, password } del formulario de /login.
      async authorize(credentials): Promise<SessionUser | null> {
        const email = typeof credentials?.email === 'string' ? credentials.email : '';
        const password = typeof credentials?.password === 'string' ? credentials.password : '';
        if (!email || !password) return null;

        try {
          const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });
          if (!res.ok) return null; // 401 INVALID_CREDENTIALS -> null (sin detalle)
          const json = (await res.json()) as { data: SessionUser };
          return json.data; // { id, email, name, image, role }
        } catch {
          return null;
        }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // user viene de GitHub o de Credentials.authorize (SessionUser).
        (token as { role?: Role }).role = (user as SessionUser).role ?? 'usuario';
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { role?: Role }).role =
          (token as { role?: Role }).role ?? 'usuario';
      }
      return session;
    },
  },
});
```

**Contratos que debe respetar el Web:**
- El `CredentialsProvider` debe devolver **exactamente** `{ id, email, name, image, role }` (lo que la API responde en `data`). Auth.js usará `id` como `sub` del JWT y `email` en el token; el guard de la API los lee (`sub`, `email`) y resuelve el rol desde la DB.
- `authorize` devuelve `null` ante cualquier error 4xx/5xx (Auth.js lo traduce en "credenciales inválidas" sin filtrar el motivo).
- El toggle en `/login` simplemente renderiza el formulario de credenciales o el botón de GitHub; al enviar credenciales llama a `signIn('credentials', { email, password, redirect })`.

---

## 9. Rate limiting (RECOMENDADO, no bloqueante para v1)

Añadir `@nestjs/throttler` y proteger `/auth/login` y `/auth/register` contra
fuerza bruta/enumeración:

```ts
// En AuthModule (o AppModule):
ThrottlerModule.forRoot({
  throttlers: [{ name: 'auth', ttl: 60_000, limit: 10 }],
});

// En AuthController:
@Throttle('auth')
@Controller('auth')
export class AuthController { ... }
```

Respuesta al exceder: `429` con `code: 'RATE_LIMITED'` (ya existe en `ErrorCodes`).

---

## 10. Checklist para implementadores

**Backend (`apps/api`):**
- [ ] `schema.prisma`: añadir `passwordHash String?` a `User`.
- [ ] Generar migración `--create-only` (o SQL de §2.1); **no aplicar**.
- [ ] `error-codes.ts`: añadir `EMAIL_ALREADY_EXISTS`, `WEAK_PASSWORD`, `INVALID_EMAIL`, `INVALID_CREDENTIALS`.
- [ ] `packages/types`: añadir `RegisterDto`, `LoginDto`, `LoginResponse`, `RegisterResponse`.
- [ ] Crear `auth/dto/auth.dto.ts`, `auth/auth.service.ts`, `auth/auth.controller.ts`.
- [ ] Ampliar `auth.module.ts` (importar `UsersModule`, registrar controller+service).
- [ ] `bcryptjs` + `@types/bcryptjs` instalados.
- [ ] Ajustar `users.service.ts#sync` según §7 (no tocar `passwordHash`).
- [ ] Tests unitarios: `AuthService` (registro duplicado, password débil, login ok/fallo, no fuga de hash) y `sync` (upsert por email/id, preservación de `passwordHash`).

**Frontend (`apps/web`):**
- [ ] `auth.ts`: añadir `CredentialsProvider` con `authorize` leyendo `json.data` (§8).
- [ ] `/login`: toggle GitHub ↔ formulario de credenciales; `signIn('credentials', {...})`.
- [ ] Tipar el body de `authorize` con `LoginResponse` de `@ticketera/types`.

**Devops:**
- [ ] Revisar y aplicar migración en Neon (`prisma migrate deploy`) tras aprobación.
- [ ] Confirmar que `AUTH_SECRET` está disponible tanto en Web como en API (Vercel env).
- [ ] (Opcional) habilitar throttler en el deploy serverless.

---

## 11. Notas de seguridad

- **No exponer `passwordHash`** en ningún endpoint ni en `SessionUser`.
- **Mensaje genérico** en login (`INVALID_CREDENTIALS`) para evitar enumeración.
- `bcryptjs` con `saltRounds = 10` (equilibrio costo/seguridad para serverless).
- `passwordHash` nullable: cualquier lógica que verifique contraseña debe chequear
  `passwordHash !== null` antes de `bcrypt.compare` (si es `null`, es cuenta OAuth
  → `INVALID_CREDENTIALS`).
- El rol siempre se resuelve desde la DB en `jwt-auth.guard.ts`, nunca desde el
  payload del JWT.

# Requerimientos — Registro de cuenta simple (ticketera)

**Autor:** Project Manager
**Fecha:** 2026-08-13
**Estado:** Aprobado (decisiones de producto confirmadas por el usuario)
**Alcance:** Autenticación local (email + contraseña) como opción adicional al login con
GitHub ya existente. Sin verificación de correo.

---

## 1. Contexto y objetivo

Hoy la plataforma solo permite autenticarse vía GitHub (Auth.js v5, proveedor
GitHub, estrategia JWT). Esto excluye a personas sin cuenta GitHub o que prefieren
credenciales propias. El objetivo de esta entrega es habilitar un **registro de
cuenta simple** (email + contraseña) y un **login con credenciales** para cuentas
ya existentes, conviviendo con el login de GitHub sin romperlo.

Restricciones de producto acordadas:
- Registro con email + contraseña (sin enlace mágico, sin SMTP).
- El login con GitHub se mantiene; el registro es **adicional**, no reemplaza.
- Rol por defecto de toda cuenta nueva: `usuario`. Un `admin` puede promover a
  `agente`/`admin` (ya existe `PATCH /users/:id/role` en el backend).
- UI: toggle en la misma página `/login` (formulario "Crear cuenta": nombre, email,
  contraseña) y login con credenciales (email, contraseña) para cuentas existentes.
- Validaciones mínimas: email único, password mínimo 8 caracteres, formato email válido.
- No hay verificación de correo (registro "simple").

---

## 2. Decisiones de producto (confirmadas)

| # | Decisión |
|---|----------|
| D1 | Método de registro: email + contraseña. Sin magic link ni SMTP. |
| D2 | Login con GitHub se conserva y debe seguir funcionando igual. |
| D3 | Rol por defecto = `usuario`. Promoción posterior por admin (updateRole). |
| D4 | Toggle en `/login` para alternar "Iniciar sesión" / "Crear cuenta". |
| D5 | Validaciones: email único, password >= 8 caracteres, formato email válido. |
| D6 | Sin verificación de correo. |
| D7 | Seguridad: no registrar passwords en logs; mensajes de error genéricos para
      credenciales inválidas (sin revelar qué campo falló). |

---

## 3. Épicas y módulos

### ÉPICA AUTH-LOCAL — Autenticación local (email + contraseña)
Módulos:
- **AUTH-LOCAL-REG** Registro de cuenta (creación de usuario con credenciales).
- **AUTH-LOCAL-LOGIN** Inicio de sesión con credenciales (email + password).
- **AUTH-LOCAL-UI** Toggle y formularios en `/login` (crear cuenta / iniciar sesión).
- **AUTH-LOCAL-VAL** Validaciones y manejo de errores (email único, formato, longitud,
  credenciales inválidas).
- **AUTH-LOCAL-SEC** Seguridad básica (sin logs de password, mensajes genéricos, hashing).

### ÉPICA AUTH-OAUTH — Convivencia con GitHub (existente)
Módulo:
- **AUTH-OAUTH-KEEP** Garantizar que el login con GitHub siga operativo y que las
  cuentas creadas por OAuth no colisionen ni se vean afectadas por el registro local.

### ÉPICA RBAC — Roles y gestión por admin
Módulos:
- **RBAC-DEFAULT** Asignación de rol `usuario` por defecto a toda cuenta nueva (local u OAuth).
- **RBAC-ADMIN** Cambio de rol por admin (endpoint `PATCH /users/:id/role` ya existe;
  validar que funciona con cuentas locales nuevas).

> Nota de dominio: El ciclo de vida del **ticket** usa el patrón State
> (abierto -> en_progreso -> ...). El "registro de cuenta" NO introduce estados de
> cuenta (no hay `pendiente` porque no hay verificación de correo). Las cuentas nacen
> `activas` con rol `usuario`. No aplica la state machine de tickets a esta entrega.

---

## 4. Modelo de dominio relevante (lenguaje natural)

Entidad **User** (ya existente en Prisma; se amplía para credenciales):
- `id` (UUID).
- `name` (nombre visible; requerido en registro local, opcional en GitHub).
- `email` (único, normalizado a minúsculas; usado como identidad de login).
- `passwordHash` (hash fuerte, p. ej. bcrypt/argon2; **nulo** para cuentas solo-GitHub).
- `role` (`admin` | `agente` | `usuario`); por defecto `usuario`.
- señal de origen/proveedor (GitHub, credentials, o ambos si se vinculan).
- `createdAt`, `updatedAt`.

Reglas de negocio (producto):
- Un `email` solo puede existir una vez en el sistema, independientemente del proveedor
  (ver US-05 / política de colisión).
- Una cuenta solo-GitHub (`passwordHash = null`) no puede iniciar sesión con credenciales;
  el login por credenciales requiere `passwordHash` presente.
- Toda cuenta nueva (local u OAuth) nace con `role = usuario`.

---

## 5. Historias de usuario y criterios de aceptación (Given/When/Then)

### US-01 — Registrarse creando una cuenta
**Como** visitante, **quiero** crear una cuenta con nombre, email y contraseña,
**para** acceder a la plataforma con mis propias credenciales.

- **Dado** que soy un visitante en `/login` con el toggle en "Crear cuenta",
  **cuando** completo nombre, email y contraseña válidos y envío el formulario,
  **entonces** se crea una cuenta con rol `usuario`, se inicia mi sesión y soy
  redirigido al dashboard.
- **Dado** que la cuenta se creó correctamente,
  **cuando** consulto mi perfil (`/users/me`),
  **entonces** mi `role` es `usuario` y mi `email` coincide con el registrado.

### US-02 — Iniciar sesión con credenciales
**Como** usuario registrado, **quiero** iniciar sesión con email y contraseña,
**para** acceder a mi cuenta sin usar GitHub.

- **Dado** que existe una cuenta con email y `passwordHash` válido,
  **cuando** ingreso email y contraseña correctos en el formulario de login por credenciales,
  **entonces** se emite el JWT de sesión y soy redirigido al dashboard.
- **Dado** que la cuenta existe pero es solo-GitHub (`passwordHash = null`),
  **cuando** intento login por credenciales con ese email,
  **entonces** recibo el mensaje genérico de credenciales inválidas (ver US-07) y no se
  revela que la cuenta existe sin password.

### US-03 — Iniciar sesión con GitHub (existente)
**Como** usuario con cuenta GitHub, **quiero** seguir iniciando sesión con GitHub,
**para** no perder mi forma de acceso actual.

- **Dado** que el registro local está habilitado,
  **cuando** un usuario inicia sesión con el botón de GitHub,
  **entonces** el flujo OAuth funciona exactamente como antes, crea/sincroniza la cuenta
  vía `POST /users/sync` y lo redirige al dashboard.
- **Dado** un usuario que antes solo usaba GitHub,
  **cuando** inicia sesión con GitHub después de haberse desplegado el registro local,
  **entonces** su cuenta sigue disponible y su rol se conserva (no se sobrescribe).

### US-04 — Toggle en /login
**Como** visitante, **quiero** alternar en `/login` entre "Iniciar sesión" e "Crear cuenta",
**para** no tener que navegar a otra página.

- **Dado** que estoy en `/login`,
  **cuando** cambio el toggle a "Crear cuenta",
  **entonces** se muestra el formulario con campos nombre, email, contraseña y el botón
  "Crear cuenta".
- **Dado** que estoy en `/login`,
  **cuando** cambio el toggle a "Iniciar sesión",
  **entonces** se muestra el formulario con campos email, contraseña, el botón
  "Iniciar sesión" y el botón de GitHub.
- **Dado** que alterno el toggle,
  **cuando** lo hago,
  **entonces** no se pierden los datos ya ingresados en los campos comunes (email) y no
  se envía nada al servidor hasta accionar el botón.

### US-05 — Email único
**Como** usuario, **quiero** que se rechace un registro con un email ya existente,
**para** evitar cuentas duplicadas.

- **Dado** que ya existe una cuenta (local o GitHub) con email `x@y.com`,
  **cuando** intento registrar una cuenta local con ese mismo email,
  **entonces** el registro es rechazado con un error de conflicto (409 `CONFLICT`) y
  mensaje amigable "Este correo ya está registrado".
- **Dado** la política de colisión (D2/D5): el email es único globalmente,
  **cuando** una cuenta GitHub y una local comparten email,
  **entonces** el sistema las trata como la misma identidad y NO permite crear una
  segunda fila con el mismo email (decisión de producto: rechazar el registro local para
  ese email; vincular cuentas queda fuera de alcance de esta entrega).

> Decisión pendiente a confirmar (recomendada): ante email duplicado entre proveedores,
> rechazar el registro local con el mensaje anterior, en lugar de vincular
> automáticamente, para evitar riesgo de account takeover. El team-leader debe
> implementar la unicidad a nivel de `email` en la base de datos.

### US-06 — Validación de formato y longitud
**Como** usuario, **quiero** que se valide el formato del email y que la contraseña tenga
al menos 8 caracteres, **para** recibir feedback claro antes de enviar.

- **Dado** que completo el formulario de registro,
  **cuando** el email no tiene formato válido,
  **entonces** el formulario muestra error de validación en el campo email y bloquea el
  envío (422 en backend también).
- **Dado** que completo el formulario de registro,
  **cuando** la contraseña tiene menos de 8 caracteres,
  **entonces** el formulario muestra error "La contraseña debe tener al menos 8
  caracteres" y bloquea el envío.
- **Dado** que el backend recibe un registro inválido,
  **cuando** valida los campos,
  **entonces** responde 422 `VALIDATION_ERROR` con `details` por campo, sin crear la cuenta.

### US-07 — Mensaje genérico para credenciales inválidas
**Como** usuario, **quiero** un mensaje genérico cuando mis credenciales sean incorrectas,
**para** no dar pistas a atacantes sobre qué campo falló.

- **Dado** que intento login por credenciales,
  **cuando** el email no existe O la contraseña es incorrecta,
  **entonces** en ambos casos recibo exactamente el mismo mensaje:
  "Correo o contraseña incorrectos" (sin distinguir cuál falló) y un código de error
  401 `UNAUTHENTICATED`.
- **Dado** un atacante probando emails,
  **cuando** consulta el endpoint de login,
  **entonces** no puede inferir si un email está registrado a partir de la respuesta
  (mismo mensaje y código para email-inexistente y password-incorrecta).

### US-08 — Rol por defecto `usuario`
**Como** nuevo usuario, **quiero** que mi cuenta se cree con rol `usuario`,
**para** tener acceso básico hasta que un admin me promueva.

- **Dado** que me registro por cualquier medio (local o GitHub),
  **cuando** se crea mi cuenta,
  **entonces** mi `role` es `usuario` por defecto y no tengo privilegios de `agente` ni `admin`.

### US-09 — Admin cambia rol (updateRole existente)
**Como** admin, **quiero** cambiar el rol de un usuario a `agente` o `admin`,
**para** delegar soporte/gestión.

- **Dado** que soy `admin` y existe un usuario con rol `usuario`,
  **cuando** llamo a `PATCH /users/:id/role` con `{ role: "agente" }`,
  **entonces** el rol del usuario se actualiza y la respuesta refleja el nuevo rol.
- **Dado** que soy `usuario` o `agente`,
  **cuando** intento llamar a `PATCH /users/:id/role`,
  **entonces** recibo 403 `FORBIDDEN` y el rol no cambia.
- **Dado** el registro local desplegado,
  **cuando** un admin promueve a un usuario recién registrado por credenciales,
  **entonces** el flujo funciona idéntico a como funciona hoy con usuarios GitHub.

### US-10 — No registrar passwords en logs
**Como** responsable de seguridad, **quiero** que las contraseñas nunca se escriban en logs,
**para** evitar fugas de credenciales.

- **Dado** cualquier operación de registro o login,
  **cuando** el sistema genera logs de auditoría/errores,
  **entonces** el campo de contraseña (texto plano) y su hash nunca aparecen en ningún
  log, ni en cuerpos de request logueados.
- **Dado** un error de validación de registro,
  **cuando** se registra para depuración,
  **entonces** se loguea solo el email (o un identificador no sensible) y nunca la
  contraseña.

### US-11 — Convivencia y casos borde (OAuth vs local)
**Como** usuario, **quiero** que mi forma de acceso (GitHub o credenciales) no se rompa por
la otra, **para** tener una experiencia consistente.

- **Dado** un usuario solo-GitHub,
  **cuando** el equipo despliega el registro local,
  **entonces** su login con GitHub sigue funcionando y su cuenta no se duplica.
- **Dado** un usuario local,
  **cuando** intenta login con GitHub usando el mismo email que su cuenta local,
  **entonces** (según política US-05) NO se crea una cuenta nueva; se le informa que ya
  existe una cuenta con ese correo y debe usar login por credenciales.

---

## 6. Backlog priorizado (orden de implementación sugerido)

**Prioridad P0 — MVP funcional (login local + registro):**
1. US-01 Registro de cuenta (backend: creación de User con passwordHash, nombre, email).
2. US-08 Rol por defecto `usuario` en la creación.
3. US-02 Login con credenciales (Auth.js Credentials provider + verificación de hash).
4. US-05 Unicidad de email (BD + validación de conflicto 409).
5. US-06 Validación de formato/longitud (cliente + backend 422).
6. US-07 Mensaje genérico para credenciales inválidas (401, sin revelar campo).
7. US-10 No loguear passwords (regla transversal de logging).

**Prioridad P1 — Experiencia de usuario (UI):**
8. US-04 Toggle en `/login` y formularios (crear cuenta / iniciar sesión) con validación en cliente.
9. US-03 Verificación de que el login con GitHub sigue operativo tras el cambio.

**Prioridad P2 — Administración y robustez:**
10. US-09 Validar updateRole con cuentas locales nuevas (endpoint ya existe; cubrir con pruebas).
11. US-11 Política de colisión OAuth/local y pruebas de convivencia.

**Fuera de alcance (se registra como nota para futuras épicas):**
- Verificación de correo / magic links / SMTP.
- Recuperación de contraseña ("olvidé mi password").
- Vinculación de cuenta GitHub <-> credenciales (set password para cuenta solo-GitHub).
- MFA / 2FA.

---

## 7. Definición de Listo (DoD)

Una historia o el conjunto de la entrega se considera **LISTO** cuando:

- [ ] El registro local crea una cuenta con `role = usuario` y sesión iniciada (US-01, US-08).
- [ ] El login con credenciales funciona para cuentas con `passwordHash` (US-02).
- [ ] El login con GitHub sigue funcionando igual que antes (US-03).
- [ ] Existe toggle en `/login` que alterna formularios sin pérdida de email y sin llamadas
      prematuras al servidor (US-04).
- [ ] El email es único a nivel de base de datos; registro duplicado devuelve 409 `CONFLICT`
      con mensaje amigable (US-05).
- [ ] Validación de email con formato válido y password >= 8 caracteres, en cliente (bloqueo)
      y backend (422 `VALIDATION_ERROR`) (US-06).
- [ ] Credenciales inválidas devuelven siempre el mismo mensaje genérico y código 401, sin
      revelar campo (US-07).
- [ ] Ningún log contiene passwords en texto plano ni hashes (US-10).
- [ ] El admin puede cambiar el rol de un usuario local vía `PATCH /users/:id/role` (US-09).
- [ ] La política de colisión OAuth/local está definida e implementada; cuentas no se duplican
      (US-11 / D5).
- [ ] Se cubre con pruebas: unitarias (validaciones, hashing, unicidad) y al menos un e2e de
      registro + login + GitHub + error de credenciales.
- [ ] Documentación de usuario mínima en `/login` (ayuda/errores claros) y el
      `docs/api-contract.md` refleja el nuevo flujo de credenciales (si aplica).
- [ ] Despliegue en Vercel (preview) verificado con los tres flujos: registro, login
      credenciales, login GitHub.
- [ ] No se commitean secretos ni `.env*`.

---

## 8. Criterios de seguridad (consolidado)

1. **Sin exposición de contraseñas en logs**: ni texto plano ni hash en ningún nivel de log
   (app, gateway, error tracking). Aplicar también a cuerpos de request capturados.
2. **Mensajes de error genéricos**: "Correo o contraseña incorrectos" para cualquier fallo de
   credenciales; mismo código HTTP (401) y mismo cuerpo, indistintamente de si el email no
   existe o la password es incorrecta. Esto evita enumeración de usuarios.
3. **Hashing fuerte en reposo**: la contraseña se almacena únicamente como hash
   (bcrypt/argon2 con salt); el backend nunca guarda el texto plano.
4. **Unicidad de email**: el `email` es clave de identidad única a nivel de sistema; se impone
   restricción en BD y se maneja el conflicto con 409.
5. **Defensa en profundidad**: validación en cliente (UX) y validación estricta en backend
   (fuente de verdad) con `class-validator` y respuesta 422.
6. **JWT existente**: se reutiliza la estrategia JWT de Auth.js ya configurada; el
   registro/login local emite el mismo tipo de sesión que GitHub.

---

## 9. Notas para el team-leader / backend (sin código)

- Habilitar el **Credentials provider** de Auth.js v5 junto al provider GitHub ya existente;
  ambos bajo la misma estrategia JWT.
- El registro es un endpoint/mutación protegido contra abuso básico (rate-limit recomendado,
  aunque no bloqueante para el MVP): considerar límite de intentos de registro por IP/email.
- La creación de usuario debe pasar por la lógica existente de `POST /users/sync`/creación
  para garantizar consistencia de `role` y perfil.
- `passwordHash` debe ser **opcional/nullable** en el modelo para no romper a los usuarios
  solo-GitHub.
- El `updateRole` (`PATCH /users/:id/role`) ya existe; verificar que acepta usuarios locales y
  que la autorización (solo admin) se mantiene.
- Reutilizar el formato de error estándar del contrato API
  (`{ error: { code, message, details } }`) para 409 `CONFLICT`, 422 `VALIDATION_ERROR`,
  401 `UNAUTHENTICATED`.
- No introducir estados de cuenta (no hay verificación); las cuentas nacen activas.

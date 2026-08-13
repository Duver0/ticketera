# Especificación de diseño — Pantalla de autenticación `/login`

**Rol:** UI/UX Designer · **Estado:** Spec para implementación (frontend `apps/web`).
**Alcance:** Combinar el login con GitHub (existente) con registro/login por
credenciales (email+contraseña) en una sola página `/login`, usando un toggle.
**Restricción de este entregable:** solo documentación. NO se editan `auth.ts`,
`login/page.tsx` ni componentes de `components/ui`. Se reutilizan y se referencian.

---

## 0. Contexto y objetivo

Hoy `/login` solo muestra el botón "Iniciar sesión con GitHub" dentro de una
tarjeta centrada. Esta spec añade, en la **misma tarjeta**, un formulario de
credenciales y un toggle para alternar entre:

- **Iniciar sesión**: email + contraseña (cuentas existentes) **+** botón de GitHub.
- **Crear cuenta**: nombre + email + contraseña (registro nuevo, rol `usuario`).

El toggle no navega a otra ruta; es un cambio de modo dentro de `/login`. No se
pierden los datos comunes (email) al alternar, y no se envía nada al servidor
hasta pulsar el botón (US-04 de `requirements-registro.md`).

---

## 1. Tokens y componentes reutilizados (referencia obligatoria)

Todo color/radio/sombra sale de `globals.css` + `tailwind.config.ts`. No se
hardcodea ningún hex en la pantalla.

### 1.1 Tokens de color (clases Tailwind → variable CSS)
| Uso | Clase | Variable |
|-----|-------|----------|
| Marca / primario | `bg-brand`, `text-brand-fg`, `hover:bg-brand-hover` | `--color-brand` (#2563eb) |
| Anillo de foco marca | `ring-brand-ring` | `--color-brand-ring` (#93c5fd) |
| Error / peligro | `border-danger`, `text-danger`, `bg-danger`, `bg-danger-bg`, `text-danger-fg` | `--color-danger` (#dc2626), `--color-danger-fg` (#991b1b) |
| Superficies | `bg-surface`, `surface-subtle`, `surface-muted` | `--bg-base`, `--bg-subtle`, `--bg-muted` |
| Borde | `border-line`, `border-line-strong` | `--border-default` (#e2e8f0) |
| Texto | `text-content`, `text-content-secondary`, `text-content-tertiary` | `--text-primary` (#0f172a), `--text-secondary` (#475569), `--text-tertiary` (#94a3b8) |

Dark mode: gratis vía clase `.dark` (los tokens de superficie/texto se
sobrescriben). No se hace lógica extra.

### 1.2 Radios y sombras
- Card: `rounded-xl` + `shadow-sm`.
- Inputs / botones / divider: `rounded-lg`.
- Foco visible global: `:focus-visible` → `ring-2 ring-brand-ring ring-offset-2 ring-offset-surface`. Los componentes `Button`/`Input` ya lo aplican.

### 1.3 Componentes existentes a usar (NO modificar)
- `apps/web/src/app/login/page.tsx` → patrón de tarjeta centrada (`main` flex
  centrado + `div` `max-w-sm rounded-xl border border-line bg-surface p-8 shadow-sm animate-fade-in`).
- `components/ui/Card.tsx` → `Card`/`CardHeader`/`CardBody` (opcional; el patrón
  inline actual ya basta, pero se puede migrar a `Card`).
- `components/ui/Button.tsx` → `Button` con `variant` (`primary`|`secondary`|`ghost`|`danger`),
  `size="md"`, y `loading` (muestra spinner y deshabilita). Usar `className="w-full"`.
- `components/ui/Field.tsx` → `Field` (label + error `role="alert"` con
  `id={htmlFor}-error`) y `Input` (prop `invalid` → `border-danger` + `aria-invalid`).
- `components/ui/Tabs.tsx` → `Tabs` (`role=tablist`, `role=tab`, `aria-selected`) para el toggle.
- `components/ui/Spinner.tsx` → `Spinner` (`h-6 w-6` para el estado de sesión cargando).
- `components/ui/Toast.tsx` → `useToast()` para el mensaje de éxito transitorio.

> Nota de diseño (AA): `Field` pinta el error con `text-danger` (#dc2626) sobre
> blanco ≈ 4.0:1, ligeramente por debajo de AA (4.5:1) para texto normal de 12px.
> **Recomendación para team-leader:** que `Field` use `text-danger-fg` (#991b1b,
> ≈7:1) en el texto de error. Mientras tanto, en esta pantalla se puede forzar
> `className="text-danger-fg"` en el `<p>` de error si es necesario.

---

## 2. Layout y jerarquía visual

Estructura (reutiliza el patrón actual de `/login`):

```
<main class="flex min-h-screen items-center justify-center bg-surface px-4">
  <div class="w-full max-w-sm rounded-xl border border-line bg-surface p-6 shadow-sm animate-fade-in sm:max-w-md sm:p-8">
    [Header: logo + título + subtítulo]            mb-6
    [Toggle Tabs: Iniciar sesión | Crear cuenta]   mb-6, w-full
    [Banner de error de formulario (solo 401)]     mb-4 (condicional)
    [Formulario según modo]                        space-y-4
    [Divider "o" + Botón GitHub]                   (solo modo login)
    [Footer link: ¿No tienes cuenta? Crea una]     mt-6 text-center
  </div>
</main>
```

- **Header** (igual que hoy): logo `h-12 w-12 rounded-xl bg-brand text-2xl font-bold text-brand-fg` con la letra `t`;
  título `text-xl font-semibold text-content` "ticketera";
  subtítulo `text-sm text-content-secondary` (ver textos en §4).
- **Ancho**: `max-w-sm` (384px) en móvil, `sm:max-w-md` (448px) en escritorio para
  dar aire a los 3 campos del registro.
- **Espaciado**: `space-y-4` entre campos; `gap-1.5` interno ya lo aporta `Field`;
  `mb-6` tras header y tras toggle; `mt-6` antes del footer.
- **Jeraquía visual**: el CTA principal (submit) es `primary` (marca); GitHub es
  `secondary` (borde, superficie) para marcarlo como vía alternativa; el toggle y
  el footer son texto secundario.

---

## 3. Toggle de modo — decisión y justificación

**Decisión:** usar `Tabs` (componente existente) como **control segmentado**
full-width en la parte superior de la tarjeta, con dos pestañas:
`Iniciar sesión` (key `login`) y `Crear cuenta` (key `register`).

**Por qué Tabs y no link/botón suelto:**
1. Comunica "dos modos de la misma página" (una sola tarjeta), no navegación.
2. `Tabs` ya es accesible (`role=tablist`/`role=tab`/`aria-selected`) y está temado
   con los tokens de marca (pestaña activa `bg-brand text-brand-fg`).
3. Al ser un solo formulario con estado levantado al padre, podemos **conservar
   el valor de `email`** al alternar (cumple US-04: "no se pierden los datos ya
   ingresados en los campos comunes").
4. Nada se envía al servidor al alternar; el cambio solo muta el estado local.

**Implementación visual sugerida (sin editar el componente):**
- Envolver `Tabs` en `flex justify-center` y pasar `className="w-full"`.
- Las pestañas deben repartirse equitativamente: en el render del formulario se
  usan `flex-1` sobre los botones de `Tabs` (pequeño ajuste de clase en el消费idor,
  no en el componente).
- `value` controlado por el estado `mode` del padre; `onChange` solo cambia `mode`
  (y conserva `email`).

**Textos de las pestañas:** `Iniciar sesión` · `Crear cuenta`.

---

## 4. Campos, etiquetas y textos (español)

### 4.1 Modo "Iniciar sesión" (login)
| Elemento | Etiqueta / Texto | Tipo | `id` | Requerido |
|----------|------------------|------|------|-----------|
| Email | `Correo electrónico` | `email` | `email` | sí |
| Contraseña | `Contraseña` | `password` | `password` | sí |
| Submit | `Iniciar sesión` | button primary | — | — |
| GitHub | `Continuar con GitHub` | button secondary | — | — |
| Footer | `¿No tienes cuenta? Crea una` | link | — | — |

### 4.2 Modo "Crear cuenta" (register)
| Elemento | Etiqueta / Texto | Tipo | `id` | Requerido |
|----------|------------------|------|------|-----------|
| Nombre | `Nombre` | `text` | `name` | sí |
| Email | `Correo electrónico` | `email` | `email` | sí |
| Contraseña | `Contraseña` | `password` | `password` | sí |
| Submit | `Crear cuenta` | button primary | — | — |
| Footer | `¿Ya tienes cuenta? Inicia sesión` | link | — | — |

### 4.3 Textos fijos
- Subtítulo header: `Gestión de tickets tipo Jira.` + salto + `Inicia sesión o crea tu cuenta para continuar.`
- Divider: texto central `o` (sobre línea `border-line`), en `text-content-tertiary`.
- Banner genérico 401: `Correo o contraseña incorrectos` (ver §6).
- Éxito transitorio (toast): `Cuenta creada. Iniciando sesión…`
- Error de red/inesperado (toast): `No pudimos completar la operación. Inténtalo de nuevo.`

> Los textos de mensajes de error de campo coinciden **exactamente** con los del
> backend (§6) para no desorientar al usuario.

---

## 5. Estados de los campos y del formulario

### 5.1 Por campo (idle / focus / error)
- **Idle:** `Input` con `border-line`, `bg-surface`, `text-content`,
  `placeholder:text-content-tertiary`.
- **Focus:** `focus-visible:ring-2 ring-brand-ring ring-offset-2 ring-offset-surface`
  (ya lo aplica `Input`); no cambia borde salvo el anillo.
- **Error:** `Input` con `invalid` → `border-danger` + `aria-invalid="true"`;
  texto de error bajo el campo con `text-danger-fg` (ver nota AA §1.3),
  `text-xs`, `role="alert"`, `id={htmlFor}-error`.
- **Disabled (durante loading):** `Input disabled` queda `opacity-60` (estilo base
  de `Input`); el botón se deshabilita solo (`Button` lo hace con `loading`).

### 5.2 Del formulario
- **idle:** lista para escribir; submit habilitado si pasa validación cliente.
- **loading (sesión resolviendo):** mientras `useSession().status === 'loading'`,
  mostrar `<Spinner className="h-6 w-6" />` centrado en lugar del formulario
  (patrón actual de `login/page.tsx`).
- **loading (envío):** botón submit con `loading` (spinner interno + deshabilitado);
  el resto del formulario se deshabilita (`fieldset disabled` o `disabled` por campo).
- **error:** dos formas (ver §6):
  - *Campo:* borde + mensaje bajo el campo (409 / 400 por campo).
  - *Formulario:* banner superior `rounded-lg border border-danger/40 bg-danger-bg px-3 py-2.5 text-sm text-danger-fg` con `role="alert"` (401 genérico).
- **success:** estado transitorio — se muestra toast de éxito y se redirige a `/`
  (no hay pantalla de éxito dedicada; ver diagrama §10).

---

## 6. Validación en cliente y mapeo de errores del backend

### 6.1 Validación en cliente (bloquea el envío)
| Campo | Regla | Mensaje cliente |
|-------|-------|-----------------|
| `name` (registro) | no vacío, ≤100 chars | `Introduce tu nombre` |
| `email` | formato `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` | `Introduce un correo electrónico válido` |
| `password` (registro) | longitud ≥ 8 | `La contraseña debe tener al menos 8 caracteres` |
| `password` (login) | no vacío | `Introduce tu contraseña` |

El botón submit se deshabilita (o el `onSubmit` hace `preventDefault`) si alguna
regla falla; el foco va al primer campo inválido.

### 6.2 Mapeo de errores del backend → UI

El **registro** llama directamente a `POST /api/v1/auth/register` (fetch propio),
por lo que puede leer `error.code` del contrato
(`{ error: { code, message, details } }`). El **login por credenciales** usa
`signIn('credentials', …)` cuyo `authorize` devuelve `null` ante cualquier fallo,
así que solo sabemos "falló" → mensaje genérico.

| Origen | Código HTTP / `error.code` | Dónde se muestra | Texto exacto |
|--------|----------------------------|------------------|--------------|
| Register | `409 EMAIL_ALREADY_EXISTS` | Error de campo **email** | `Este correo ya está registrado` |
| Register | `400 WEAK_PASSWORD` | Error de campo **password** | `La contraseña debe tener al menos 8 caracteres e incluir letras y números` |
| Register | `400 VALIDATION_ERROR` | Por campo según `details` | Mismo texto de regla cliente correspondiente |
| Register | red / 5xx / otro | Toast error | `No pudimos completar la operación. Inténtalo de nuevo.` |
| Login (credentials) | `401 INVALID_CREDENTIALS` u otro fallo de `signIn` | Banner de formulario (genérico) | `Correo o contraseña incorrectos` |

**Reglas de seguridad (no negociables, de `requirements-registro.md` US-07):**
- El mensaje de login es **siempre** el mismo y genérico; nunca revela si el email
  existe o la contraseña está mal.
- En login, el error es de **formulario**, no de un campo concreto (evita enumeración).

> **Flag para team-leader:** `auth-design.md` §5.2 define el mensaje backend de
> `INVALID_CREDENTIALS` como `"Credenciales inválidas"`, mientras que el producto
> (US-07) y esta spec usan `"Correo o contraseña incorrectos"`. Como el login pasa
> por `signIn` (que solo recibe `null`), el texto visible lo pone el front. Se
> recomienda alinear también el mensaje del backend a `"Correo o contraseña
> incorrectos"` por consistencia si algún día se expone.

---

## 7. Accesibilidad (a11y)

- **Labels asociados:** cada `Input` lleva `id` y su `Field` usa `htmlFor` igual al
  `id`. No se usan placeholders como único label.
- **`aria-invalid`:** `Input` recibe `invalid` cuando hay error de ese campo
  (`aria-invalid="true"` lo pone `Field`/`Input`).
- **`aria-describedby`:** cuando hay error, el `Input` debe llevar
  `aria-describedby={`${id}-error`}` para vincularlo con el `<p id={id}-error" role="alert">`
  que ya genera `Field`. (El componente `Field` no inyecta este atributo
  automáticamente en el hijo; el formulario debe pasarlo al `Input`.)
- **Banner de formulario (401):** contenedor con `role="alert"` y
  `aria-live="assertive"`. No se vincula a un solo campo (es genérico).
- **Foco visible:** se mantiene el anillo global `ring-brand-ring` en todos los
  interactivos (Tabs, Inputs, Buttons, link footer). No se elimina `outline` salvo
  el `:focus-visible` ya definido.
- **Orden de tabulación (lógico):**
  1. Tabs (`Iniciar sesión` / `Crear cuenta`).
  2. Campos en orden visual: `name` (registro) → `email` → `password`.
  3. Botón submit (`Iniciar sesión` / `Crear cuenta`).
  4. Botón `Continuar con GitHub` (solo modo login).
  5. Link footer (`¿No tienes cuenta? Crea una` / `¿Ya tienes cuenta? Inicia sesión`).
  - En modo registro, el botón GitHub está oculto, así que el orden termina en el
    submit y luego el footer.
- **Contraste AA:** texto principal `text-content` (#0f172a) y secundario
  (#475569) sobre blanco cumplen AA. Error de campo usar `text-danger-fg`
  (#991b1b) para cumplir AA (ver §1.3). El `text-content-tertiary` (#94a3b8) solo
  para texto auxiliar no esencial (divider, hints).
- **Reduced motion:** respetado globalmente por `prefers-reduced-motion` en
  `globals.css`; el `animate-fade-in`/`animate-slide-in` se neutraliza.
- **`aria-busy`:** el botón submit con `loading` ya expone `aria-busy` vía `Button`.

---

## 8. Convivencia con GitHub

- El botón de GitHub **debe quedar visible y accesible en el modo "Iniciar
  sesión"** (cumple US-03 / US-04). En el modo "Crear cuenta" se oculta para no
  inducir a error (el registro es solo por credenciales en v1).
- Estilo: `Button variant="secondary" size="md" className="w-full"` con el SVG de
  GitHub (el mismo ícono actual de `login/page.tsx`) + texto `Continuar con GitHub`.
- Separador visual: divider `o` entre el formulario de credenciales y el botón
  GitHub dentro del modo login.
- Comportamiento: `signIn('github', { callbackUrl: '/' })` (igual que hoy). El
  flujo OAuth no cambia; la cuenta se crea/sincroniza vía `POST /users/sync`.
- Cuenta solo-GitHub que intente login por credenciales → `401` genérico (US-02);
  no se le ofrece crear contraseña en v1.

---

## 9. Responsive

| Punto de corte | Comportamiento |
|----------------|----------------|
| Móvil (<640px) | Card `max-w-sm`, `p-6`, ocupa el ancho disponible con `px-4` del `main`. Un solo campo por fila (stack vertical natural). Toggle full-width. Objetivos táctiles ≥40px (`h-10` de Input/Button). |
| Escritorio (≥640px) | Card `sm:max-w-md`, `sm:p-8`, centrada. Mismo stack vertical (el formulario es de una columna por legibilidad; no se justifica 2 columnas en auth). |

- No hay diferencias de comportamiento entre breakpoints salvo el ancho/padding.
- El divider y el botón GitHub mantienen `w-full`.
- Dark mode se aplica solo (tokens), sin ramas de layout.

---

## 10. Flujo de estados (diagrama de texto)

```
[Carga /login]
   │  useSession()
   ├─ status === 'loading'      → mostrar <Spinner h-6 w-6/> centrado (sin form)
   ├─ status === 'authenticated'→ router.replace('/')              [REDIRIGE A '/']
   └─ status === 'unauthenticated' → mostrar card (toggle + form)

[Modo: Iniciar sesión]
   usuario escribe email + password
   click "Iniciar sesión"
      └─ signIn('credentials', { email, password, redirect:false })
            ├─ ok  → router.replace(callbackUrl '/')               [REDIRIGE A '/']
            └─ fail→ banner genérico "Correo o contraseña incorrectos" (role=alert)

[Modo: Iniciar sesión → GitHub]
   click "Continuar con GitHub"
      └─ signIn('github', { callbackUrl: '/' }) → OAuth →         [REDIRIGE A '/']

[Modo: Crear cuenta]
   usuario escribe nombre + email + password (validación cliente)
   click "Crear cuenta"
      └─ POST /api/v1/auth/register  (fetch directo)
            ├─ 201 → toast "Cuenta creada. Iniciando sesión…"
            │         └─ signIn('credentials', { email, password, redirect:false })
            │               ├─ ok  → router.replace('/')          [REDIRIGE A '/']
            │               └─ fail→ toast error + banner genérico
            ├─ 409 EMAIL_ALREADY_EXISTS → error campo email: "Este correo ya está registrado"
            ├─ 400 WEAK_PASSWORD        → error campo password: "La contraseña debe tener al menos 8 caracteres e incluir letras y números"
            ├─ 400 VALIDATION_ERROR     → mapear details por campo
            └─ otro/network             → toast "No pudimos completar la operación. Inténtalo de nuevo."

[Éxito común] carga → registro/login exitoso → auto-login (signIn) → redirección a '/'
```

---

## 11. Checklist para el ingeniero frontend

**Layout / tokens**
- [ ] Reutilizar el wrapper `<main>` centrado y la card `rounded-xl border border-line bg-surface shadow-sm` (ahora `p-6 sm:p-8`, `max-w-sm sm:max-w-md`).
- [ ] Header idéntico al actual (logo `t`, título, subtítulo nueva).
- [ ] Usar `bg-surface`/`text-content`/`border-line`/`ring-brand-ring` (sin hex).

**Toggle**
- [ ] `Tabs` con `login` | `register`, `className="w-full"`, pestañas `flex-1`.
- [ ] Estado `mode` en el padre; `email` también en el padre para conservarlo al alternar (US-04).
- [ ] Alternar NO dispara ninguna petición.

**Campos**
- [ ] `Field` + `Input` para `name`, `email`, `password` con los textos de §4.
- [ ] `Input` recibe `invalid` y `aria-describedby={`${id}-error`}` cuando hay error.
- [ ] Submit `Button variant="primary" size="md" loading={submitting} className="w-full"`.

**GitHub**
- [ ] `Button variant="secondary" className="w-full"` con SVG GitHub + `Continuar con GitHub`, solo en modo login, tras divider `o`.

**Validación / errores**
- [ ] Validación cliente de §6.1; bloquear submit si falla.
- [ ] Register: fetch `/auth/register`, mapear 409/400/WEAK_PASSWORD a errores de campo con los textos exactos de §6.2.
- [ ] Login: `signIn('credentials', {redirect:false})`; en fallo, banner genérico `Correo o contraseña incorrectos` (role=alert).
- [ ] Errores de red → toast.

**Accesibilidad**
- [ ] `htmlFor`/`id` emparejados; `aria-invalid`; `aria-describedby` al error; banner `role="alert"`; orden de tabulación de §7; foco visible intacto.

**Responsive / dark**
- [ ] Clases `max-w-sm sm:max-w-md`, `p-6 sm:p-8`; dark mode gratis por tokens.

**Fuera de alcance de esta spec (no editar aquí)**
- `auth.ts` (Credentials provider), `login/page.tsx` y componentes `ui/*` no se
  tocan en este entregable; se consumen tal cual. La única sugerencia de cambio es
  el color de error en `Field` (→ `text-danger-fg`) para AA, a coordinar con
  team-leader.

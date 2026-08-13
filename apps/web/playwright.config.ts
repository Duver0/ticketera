import {defineConfig, devices} from '@playwright/test';

/**
 * Configuración de Playwright para el e2e del Web (Next.js).
 *
 * - Arranca `next dev` como webServer (reusable si ya está corriendo localmente).
 * - El smoke de /login STUBBEA `/api/auth/session` para no depender de la DB ni
 *   de OAuth reales (GitHub no es automatizable aquí).
 * - El test de dashboard requiere una sesión grabada en
 *   `playwright/.auth/user.json` (ver docs/quality-gates.md). Sin ella, se omite.
 *
 * No se ejecuta contra producción: `BASE_URL` apunta a localhost por defecto.
 */
const PORT = Number(process.env.PORT ?? 3000);
// Usamos 127.0.0.1 explícito (no `localhost`) para evitar que el readiness
// probe de Playwright resuelva a IPv6 (::1) cuando Next escucha en IPv4.
const baseURL = process.env.BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  expect: {timeout: 30_000},
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{name: 'chromium', use: {...devices['Desktop Chrome']}}],
  webServer: {
    command: 'bun run dev',
    // Apuntamos el readiness probe a /login (200) para no depender de la
    // redirección 302 de / hacia /login en el middleware.
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      // Hereda el entorno; el dev server usa apps/web/.env localmente.
      ...process.env,
    } as Record<string, string>,
  },
});

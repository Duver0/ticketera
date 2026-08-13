import {test, expect} from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Test del DASHBOARD autenticado.
 *
 * El dashboard (`/`) está protegido por el middleware de Auth.js y require una
 * sesión válida (cookie `authjs.session-token`). Como el OAuth de GitHub no es
 * automatizable, este test usa una sesión PRE-GRABADA en
 * `playwright/.auth/user.json` (storageState de Playwright).
 *
 * Si no existe la sesión grabada, el test se OMITE (no falla) para no romper la
 * suite local/CI. Ver docs/quality-gates.md para grabarla (login manual con
 * `PWDEBUG=1` o `playwright codegen`).
 */
const storageStatePath = path.resolve(__dirname, '..', 'playwright', '.auth', 'user.json');
const hasRecordedSession = fs.existsSync(storageStatePath);

test.use({storageState: hasRecordedSession ? storageStatePath : undefined});

test.describe('dashboard (requiere sesión grabada)', () => {
  test.skip(
    !hasRecordedSession,
    'No hay sesión grabada en playwright/.auth/user.json. Grabarla con `PWDEBUG=1` o `playwright codegen` (ver docs/quality-gates.md).',
  );

  test('el dashboard carga con la app autenticada', async ({page}) => {
    await page.goto('/');

    // El middleware no debe redirigir a /login con una sesión válida.
    await expect(page).not.toHaveURL(/\/login/);

    // Título de la pestaña contiene la marca.
    await expect(page).toHaveTitle(/ticketera/i);

    // El shell de la app (marca) es visible.
    await expect(page.getByText(/ticketera/i).first()).toBeVisible();
  });
});

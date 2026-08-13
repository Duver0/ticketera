import {test, expect} from '@playwright/test';

/**
 * SMOKE del flujo de autenticación (UI).
 *
 * Valida que la pantalla de login renderiza el CTA de GitHub. Para no depender
 * de la DB ni de OAuth reales, se STUBBEA `/api/auth/session` para que
 * `useSession()` resuelva inmediatamente a "no autenticado" y el botón aparezca.
 * Esto aísla la prueba de la infraestructura de Auth.js/Neon.
 */
test.describe('smoke: login', () => {
  test('la página /login muestra "Iniciar sesión con GitHub"', async ({page}) => {
    await page.route('**/api/auth/session', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(null),
      }),
    );

    await page.goto('/login');

    const button = page.getByRole('button', {name: /Iniciar sesión con GitHub/i});
    await expect(button).toBeVisible();
  });
});

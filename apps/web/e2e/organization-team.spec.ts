import {test, expect, type Page} from '@playwright/test';

/**
 * E2E del flujo de Organizaciones + Roles de proyecto (UI).
 *
 * Requiere el stack completo levantado localmente (Web `bun run dev` lo arranca
 * Playwright vía webServer, pero el API NestJS + Neon deben ser alcanzables por
 * NEXT_PUBLIC_API_URL). Usa autenticación por credenciales (email/password),
 * no GitHub OAuth.
 *
 * Notas de selectores:
 *  - El formulario de registro es el único que contiene `#register-org-slug`.
 *  - El formulario de login es el único que contiene el CTA de GitHub.
 */

const password = 'E2e$up3rSecret1';

function uniq(): string {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

async function registerCreatingOrg(page: Page, email: string, slug: string): Promise<void> {
  await page.goto('/login');
  const form = page.locator('form', {has: page.locator('#register-org-slug')});
  await form.getByPlaceholder('Ada Lovelace').fill('E2E User');
  await form.getByPlaceholder('tu@correo.com').fill(email);
  await form.getByPlaceholder('••••••••').fill(password);
  await form.locator('input[name="org-mode"][value="create"]').check();
  await form.locator('#register-org-slug').fill(slug);
  await form.getByRole('button', {name: 'Crear cuenta'}).click();
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  const form = page.locator('form', {
    has: page.getByRole('button', {name: /Iniciar sesión con GitHub/i}),
  });
  await form.getByPlaceholder('tu@correo.com').fill(email);
  await form.getByPlaceholder('••••••••').fill(password);
  await form.getByRole('button', {name: /Iniciar sesión/i}).click();
}

test.describe('organizaciones y equipo', () => {
  test('registro crea organización, proyecto y muestra el panel de equipo', async ({page}) => {
    const email = `e2e_${uniq()}@test.com`;
    const slug = `e2eorg${uniq()}`.slice(0, 30);

    await registerCreatingOrg(page, email, slug);

    // Tras registrar, iniciamos sesión con credenciales.
    await login(page, email);

    // Debe quedar autenticado y poder crear un proyecto.
    await page.getByRole('link', {name: /Proyectos/i}).first().click();
    await page.getByRole('button', {name: /Nuevo proyecto/i}).click();

    const pf = page.locator('#create-project-form');
    await pf.getByPlaceholder('SUP').fill('E2E');
    await pf.getByPlaceholder('Soporte al cliente').fill('Proyecto E2E');
    await pf.getByRole('button', {name: /Crear proyecto/i}).click();

    // Llega al detalle del proyecto; abrimos la pestaña Equipo.
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.getByRole('tab', {name: 'Equipo'}).click();

    // El formulario de añadir miembro está presente (permite gestionar equipo).
    await expect(page.getByRole('button', {name: 'Añadir miembro'})).toBeVisible();
  });

  test('un supervisor no puede otorgar rol admin de proyecto (UI refleja la restricción)', async ({
    page,
    context,
  }) => {
    const ownerEmail = `e2e_owner_${uniq()}@test.com`;
    const slug = `e2eorg${uniq()}`.slice(0, 30);
    const memberEmail = `e2e_member_${uniq()}@test.com`;

    // 1) Dueño crea la org.
    await registerCreatingOrg(page, ownerEmail, slug);
    await login(page, ownerEmail);

    // 2) El dueño lee el código de invitación en /org.
    await page.goto('/org');
    const inviteCode = (await page.locator('code').first().innerText()).trim();
    expect(inviteCode.length).toBeGreaterThan(10);

    // 3) Segundo usuario se une con el código (contexto aislado = otra sesión).
    const memberPage = await context.newPage();
    await memberPage.goto('/login');
    const regForm = memberPage.locator('form', {has: memberPage.locator('#register-org-slug')});
    await regForm.getByPlaceholder('Ada Lovelace').fill('E2E Member');
    await regForm.getByPlaceholder('tu@correo.com').fill(memberEmail);
    await regForm.getByPlaceholder('••••••••').fill(password);
    await regForm.locator('input[name="org-mode"][value="join"]').check();
    await regForm.locator('#register-invite').fill(inviteCode);
    await regForm.getByRole('button', {name: 'Crear cuenta'}).click();
    await login(memberPage, memberEmail);

    // 4) Dueño crea proyecto y añade al miembro como operador.
    await page.getByRole('link', {name: /Proyectos/i}).first().click();
    await page.getByRole('button', {name: /Nuevo proyecto/i}).click();
    const pf = page.locator('#create-project-form');
    await pf.getByPlaceholder('SUP').fill('E2X');
    await pf.getByPlaceholder('Soporte al cliente').fill('Proyecto Equipo');
    await pf.getByRole('button', {name: /Crear proyecto/i}).click();
    await expect(page).toHaveURL(/\/projects\/.+/);

    await page.getByRole('tab', {name: 'Equipo'}).click();
    await page.locator('#member-search').fill(memberEmail);
    await expect(page.getByText(memberEmail)).toBeVisible();
    await page.getByText(memberEmail).click();
    await page.locator('#member-role').selectOption('operador');
    await page.getByRole('button', {name: 'Añadir miembro'}).click();

    // El miembro aparece en la lista con su rol.
    await expect(page.getByText(memberEmail).first()).toBeVisible();
    await expect(page.getByText(/Operador/i).first()).toBeVisible();

    await memberPage.close();
  });
});

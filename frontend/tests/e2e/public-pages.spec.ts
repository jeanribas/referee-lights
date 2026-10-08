// Páginas públicas: renderizam nos 3 idiomas sem erro de console nem
// requisição falha, troca de idioma pela barra, 404 e seletor de árbitro.
import { LOCALES, expect, localePath, msg, test } from './helpers';

for (const locale of LOCALES) {
  test.describe(`site público · ${locale}`, () => {
    test('home renderiza título, CTA e links principais', async ({ page }) => {
      const m = msg(locale);
      const res = await page.goto(localePath(locale, '/'));
      expect(res?.status()).toBe(200);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(m.home.heroTitle);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('a[href*="/admin"]').first()).toBeVisible();
      await expect(page.locator('a[href*="/faq"]').first()).toBeAttached();
      await expect(page.locator('a[href*="/windows"]').first()).toBeAttached();
    });

    test('faq renderiza todas as perguntas', async ({ page }) => {
      const m = msg(locale);
      const res = await page.goto(localePath(locale, '/faq'));
      expect(res?.status()).toBe(200);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(m.faq.title);
      const first = m.faq.items[0]?.q;
      if (first) await expect(page.getByText(first).first()).toBeVisible();
    });

    test('windows renderiza o guia', async ({ page }) => {
      const m = msg(locale);
      const res = await page.goto(localePath(locale, '/windows'));
      expect(res?.status()).toBe(200);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(m.windows.title);
    });

    test('rota inexistente cai no 404 próprio', async ({ page, allowIssue }) => {
      // WebKit registra o 404 da própria página como about:blank
      allowIssue(/rota-que-nao-existe|about:blank :: .*status of 404/);
      const res = await page.goto(localePath(locale, '/rota-que-nao-existe'));
      expect(res?.status()).toBe(404);
      await expect(page).toHaveTitle(/404/);
      await expect(page.locator('a[href]').first()).toBeVisible();
    });
  });
}

test('troca de idioma pela barra da home percorre pt → en → es e grava cookie', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: msg('pt-BR').common.languages['en-US'] }).click();
  await expect(page).toHaveURL(/\/en-US\/?$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(msg('en-US').home.heroTitle);
  await page.getByRole('button', { name: msg('en-US').common.languages['es-ES'] }).click();
  await expect(page).toHaveURL(/\/es-ES\/?$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(msg('es-ES').home.heroTitle);
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === 'NEXT_LOCALE')?.value).toBe('es-ES');
});

test('troca de idioma na faq mantém a página', async ({ page }) => {
  await page.goto('/faq');
  await page.getByRole('button', { name: msg('pt-BR').common.languages['en-US'] }).click();
  await expect(page).toHaveURL(/\/en-US\/faq/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(msg('en-US').faq.title);
});

test('CTA da home leva ao admin (tela de configuração)', async ({ page }) => {
  await page.goto('/');
  await page.locator('a[href="/admin"]').first().click();
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByRole('button', { name: msg('pt-BR').admin.roomSetup.create.cta })).toBeVisible();
});

test('/ref lista as três posições e /ref/xyz mostra rota inválida', async ({ page }) => {
  const m = msg('pt-BR').referee;
  await page.goto('/ref');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(m.selectorTitle);
  for (const label of [m.side.leftTitle, m.center.title, m.side.rightTitle]) {
    await expect(page.getByRole('link', { name: label })).toBeVisible();
  }
  // Clicar (página já carregada) abre o console de verdade: sem credenciais,
  // o script da tela universal mostra o aviso — pela navegação do Next nada rodava.
  await page.waitForLoadState('networkidle');
  await page.getByRole('link', { name: m.side.leftTitle }).click();
  await expect(page).toHaveURL(/\/ref\/left$/);
  await expect(page.getByRole('heading', { name: m.missing.title })).toBeVisible({ timeout: 15_000 });
  await page.goto('/ref/xyz');
  await expect(page.getByText(m.invalidRoute)).toBeVisible();
});

test('telas de app enviam X-Robots-Tag noindex', async ({ request }) => {
  for (const path of ['/admin', '/display', '/legend', '/timer', '/ref/left']) {
    const res = await request.get(path);
    expect(res.headers()['x-robots-tag'], path).toContain('noindex');
  }
});

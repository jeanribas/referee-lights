// Modal "Legenda pronta" (após Concluir): X, clique fora, Esc e "Copiar link"
// fecham; clique dentro do quadro não fecha.
import { connectedBadge, createRoom, expect, msg, test, urls } from './helpers';

test('modal Legenda pronta: X, clique fora, Esc e Copiar link fecham', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const room = await createRoom('pt-BR');
  const m = msg('pt-BR');
  await page.goto(urls.legend(room));
  await expect(connectedBadge(page)).toBeVisible({ timeout: 15_000 });

  const dialog = page.getByRole('dialog', { name: m.legend.done.title });
  const concluir = async () => {
    await page.getByRole('button', { name: m.legend.done.button }).click();
    await expect(dialog).toBeVisible();
  };

  await concluir();
  await dialog.getByRole('button', { name: m.common.srOnly.close }).click();
  await expect(dialog).toHaveCount(0);

  await concluir();
  await page.mouse.click(10, 10); // fora do quadro
  await expect(dialog).toHaveCount(0);

  await concluir();
  await dialog.getByRole('heading', { name: m.legend.done.title }).click(); // dentro: continua aberto
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  await concluir();
  await dialog.getByRole('button', { name: m.legend.share.copy }).click();
  await expect(dialog.getByRole('button', { name: m.legend.share.copied })).toBeVisible();
  await expect(dialog).toHaveCount(0, { timeout: 3_000 });
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('/legend');
});

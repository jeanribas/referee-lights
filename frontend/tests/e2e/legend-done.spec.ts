// Legenda (pedidos do Jean, 08/out): uma tela só — a janela aberta pelo admin
// é a mesma que vai para o OBS. Botão "Salvar" (sem copiar link, sem modal),
// ajuda "Como usar no OBS" no ícone de informação, e abrir a tela sem mexer
// nunca muda a configuração da sala.
import { connectedBadge, createRoom, expect, msg, open, test, urls } from './helpers';

test('legenda: Salvar grava na sala e a outra legenda (OBS) acompanha', async ({ context }) => {
  const room = await createRoom('pt-BR');
  const m = msg('pt-BR').legend;
  const obs = await open(context, urls.legend(room));
  const admin = await open(context, urls.legend(room));
  await expect(connectedBadge(obs)).toBeVisible({ timeout: 15_000 });
  await expect(connectedBadge(admin)).toBeVisible({ timeout: 15_000 });

  // ajuste feito "dentro do OBS" e salvo
  await obs.getByRole('button', { name: m.buttons.frameHide }).click();
  await obs.getByRole('button', { name: new RegExp(`^${m.share.save}`) }).click();
  await expect(obs.getByRole('button', { name: new RegExp(`^${m.share.saved}`) })).toBeVisible();
  await expect(obs.getByRole('dialog')).toHaveCount(0);
  await expect(admin.getByRole('button', { name: m.buttons.frameShow })).toBeVisible({ timeout: 10_000 });
});

test('legenda: ícone de informação mostra como usar no OBS', async ({ page }) => {
  const room = await createRoom('pt-BR');
  const m = msg('pt-BR').legend;
  await page.goto(urls.legend(room));
  await expect(connectedBadge(page)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: m.help.button }).click();
  const help = page.getByRole('region', { name: m.help.title });
  await expect(help).toBeVisible();
  for (const step of m.help.steps) await expect(help.getByText(step)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(help).toHaveCount(0);
  await page.getByRole('button', { name: m.help.button }).click();
  await page.mouse.click(640, 600); // fora
  await expect(help).toHaveCount(0);
});

test('legenda: abrir a tela (OBS novo, sem nada salvo no navegador) não muda a configuração da sala', async ({ context }) => {
  const room = await createRoom('pt-BR');
  const m = msg('pt-BR').legend;
  const admin = await open(context, urls.legend(room));
  await expect(connectedBadge(admin)).toBeVisible({ timeout: 15_000 });
  await admin.getByRole('button', { name: m.buttons.frameHide }).click();
  await admin.getByRole('button', { name: new RegExp(`^${m.share.save}`) }).click();
  await expect(admin.getByRole('button', { name: m.buttons.frameShow })).toBeVisible();
  const fresh = await context.browser()!.newContext();
  const obs = await fresh.newPage();
  await obs.goto(urls.legend(room));
  await expect(connectedBadge(obs)).toBeVisible({ timeout: 15_000 });
  await obs.waitForTimeout(1500);
  await expect(obs.getByRole('button', { name: m.buttons.frameShow })).toBeVisible();
  await expect(admin.getByRole('button', { name: m.buttons.frameShow })).toBeVisible();
  await fresh.close();
});

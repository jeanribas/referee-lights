// Painel admin pela interface: criar sessão, entrar em sessão existente,
// QR codes e links para as telas da sala.
import { createRoom, expect, msg, test, urls, connectedBadge } from './helpers';

const m = msg('pt-BR');

test('criar sessão pelo botão leva ao painel com sala e PIN na URL', async ({ page }) => {
  await page.goto('/admin');
  await page.getByRole('button', { name: m.admin.roomSetup.create.cta }).click();
  await expect(page).toHaveURL(/\/admin\?roomId=[A-Z0-9]+&pin=\d+/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: m.admin.header.title })).toBeVisible();
  await expect(connectedBadge(page)).toBeVisible({ timeout: 15_000 });
});

test('criar sessão no site em inglês cria a sala em inglês', async ({ page }) => {
  await page.goto('/en-US/admin');
  await page.getByRole('button', { name: msg('en-US').admin.roomSetup.create.cta }).click();
  await expect(page).toHaveURL(/\/en-US\/admin\?roomId=/, { timeout: 15_000 });
  await page.waitForTimeout(1000);
  await expect(page).toHaveURL(/\/en-US\/admin/);
});

test('entrar em sessão existente pelo formulário (código em minúsculas é aceito)', async ({ page }) => {
  const room = await createRoom();
  await page.goto('/admin');
  const inputs = page.locator('form input');
  await inputs.nth(0).fill(room.roomId.toLowerCase());
  await inputs.nth(1).fill(room.adminPin);
  await page.getByRole('button', { name: m.admin.roomSetup.join.submit }).click();
  await expect(page).toHaveURL(new RegExp(`roomId=${room.roomId}&pin=${room.adminPin}`), { timeout: 15_000 });
  await expect(page.getByText(`${m.common.labels.room}: ${room.roomId}`)).toBeVisible();
});

test('entrar com PIN errado pelo formulário mostra erro', async ({ page, allowIssue }) => {
  allowIssue(/403 POST .*\/access|status of 403/);
  const room = await createRoom();
  await page.goto('/admin');
  const inputs = page.locator('form input');
  await inputs.nth(0).fill(room.roomId);
  await inputs.nth(1).fill('0000');
  await page.getByRole('button', { name: m.admin.roomSetup.join.submit }).click();
  await expect(page.getByText(m.common.errors.invalid_pin)).toBeVisible({ timeout: 15_000 });
});

test('QR codes: modal lista os 3 juízes com links válidos e fecha', async ({ page, context }) => {
  const room = await createRoom();
  await page.goto(urls.admin(room));
  await page.getByRole('button', { name: m.admin.preview.showQr }).click();
  const dialog = page.getByRole('dialog', { name: m.admin.qrMenu.ariaLabel });
  await expect(dialog).toBeVisible();
  for (const label of Object.values(m.admin.qrMenu.targets)) {
    await expect(dialog.getByText(label)).toBeVisible();
  }
  await expect(dialog.locator('[data-qr-target]')).toHaveCount(3);
  // o link do QR abre o console certo (troca o host da LAN pelo do teste)
  const href = await dialog.getByText(/\/ref\/center\?roomId=/).textContent();
  const path = new URL(href!).pathname + new URL(href!).search;
  const ref = await context.newPage();
  await ref.goto(path);
  await expect(connectedBadge(ref)).toBeVisible({ timeout: 15_000 });

  await dialog.getByRole('button', { name: m.common.srOnly.close }).click();
  await expect(dialog).toHaveCount(0);
});

test('links do painel: display, cronômetro e legenda', async ({ page }) => {
  const room = await createRoom();
  await page.goto(urls.admin(room));
  // Absolutos: com o painel em localhost usam o IP da rede (o display e o
  // timer costumam abrir em outro computador); online, o próprio domínio.
  const absolute = (path: string) => new RegExp(`^https?://[^/]+${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  await expect(page.getByRole('link', { name: m.admin.preview.goToDisplay })).toHaveAttribute(
    'href',
    absolute(urls.display(room))
  );
  await expect(page.getByRole('link', { name: m.admin.preview.goToTimer })).toHaveAttribute(
    'href',
    absolute(urls.timer(room))
  );

  // Legenda abre direto no navegador, como o display e o timer (sem prévia
  // dentro do admin): é a mesma janela que vai para o OBS.
  await expect(page.getByRole('link', { name: m.admin.preview.goToLegend })).toHaveAttribute(
    'href',
    absolute(urls.legend(room))
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Clique com o admin já carregado (conectado): pela navegação do Next o
  // display (tela universal) ficava preto — o teste antigo clicava antes.
  await expect(connectedBadge(page)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('link', { name: m.admin.preview.goToDisplay }).click();
  await expect(page).toHaveURL(/\/display\?/);
  await expect(page.getByText('1:00').first()).toBeVisible({ timeout: 15_000 });
});

test('display: menu abre, tela ativa é automática (sem botão) e volta ao admin', async ({ page }) => {
  const room = await createRoom();
  await page.goto(urls.display(room));
  await page.getByRole('button', { name: m.display.menu.toggleButton }).click();
  await expect(page.getByText(m.display.menu.optionsTitle)).toBeVisible();
  await expect(page.getByText(m.display.wake.on)).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(m.display.wake.keepAwake) })).toHaveCount(0);
  await page.getByRole('link', { name: m.display.menu.goToAdmin }).click();
  await expect(page).toHaveURL(/\/admin\?roomId=/);
  await expect(page.getByText(`${m.common.labels.room}: ${room.roomId}`)).toBeVisible({ timeout: 15_000 });
});

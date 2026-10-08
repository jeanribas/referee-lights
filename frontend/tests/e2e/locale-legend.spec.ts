// Idioma da sala propagando para todas as telas e configuração da legenda
// (paleta, molduras, dígitos, salvar no servidor, link de compartilhamento).
import { JUDGES, adminSocket, createRoom, emitAck, expect, msg, open, test, urls, connectedBadge } from './helpers';

test('admin troca idioma → display, legenda, timer e 3 árbitros seguem', async ({ page, context }) => {
  test.setTimeout(90_000);
  const room = await createRoom('pt-BR');
  await page.goto(urls.admin(room));
  await expect(connectedBadge(page)).toBeVisible({ timeout: 15_000 });

  const others = [
    await open(context, urls.display(room)),
    await open(context, urls.legend(room)),
    await open(context, urls.timer(room)),
    ...(await Promise.all(JUDGES.map((j) => open(context, urls.ref(room, j)))))
  ];
  for (const p of others) await p.waitForLoadState('networkidle');

  await page.locator('select').first().selectOption('en-US');
  await expect(page).toHaveURL(/\/en-US\/admin/);
  await expect(page.getByRole('heading', { name: msg('en-US').admin.header.title })).toBeVisible({ timeout: 10_000 });

  for (const p of others) await expect(p).toHaveURL(/\/en-US\//, { timeout: 15_000 });
  const en = msg('en-US');
  await expect(others[1].getByRole('heading', { name: en.legend.title })).toBeVisible();
  await expect(others[2].getByRole('heading', { name: en.admin.timer.title })).toBeVisible();
  await expect(others[4].getByText(en.referee.center.timeLabel)).toBeVisible();

  // e de volta para espanhol
  await page.locator('select').first().selectOption('es-ES');
  for (const p of others) await expect(p).toHaveURL(/\/es-ES\//, { timeout: 15_000 });
  await expect(others[4].getByText(msg('es-ES').referee.center.timeLabel)).toBeVisible();
});

test('display troca de idioma sem recarregar (contadores de troca de pedido continuam)', async ({ context }) => {
  const room = await createRoom('pt-BR');
  const display = await open(context, urls.display(room));
  await expect(display.getByRole('button', { name: msg('pt-BR').display.menu.toggleButton })).toBeVisible({ timeout: 15_000 });
  await display.evaluate(() => {
    (window as unknown as { __semRecarregar?: boolean }).__semRecarregar = true;
  });
  const admin = await adminSocket(room);
  expect(await emitAck(admin, 'locale:change', { locale: 'en-US' })).toMatchObject({ ok: true });
  await expect(display).toHaveURL(/\/en-US\/display\?/, { timeout: 15_000 });
  await expect(display.getByRole('button', { name: msg('en-US').display.menu.toggleButton })).toBeVisible({ timeout: 15_000 });
  expect(await display.evaluate(() => (window as unknown as { __semRecarregar?: boolean }).__semRecarregar)).toBe(true);
  expect(await display.evaluate(() => document.documentElement.lang)).toBe('en-US');
  admin.disconnect();
});

test('sala criada em inglês abre as telas em inglês mesmo pela URL sem prefixo', async ({ context }) => {
  const room = await createRoom('en-US');
  const ref = await open(context, urls.ref(room, 'center'));
  await expect(ref).toHaveURL(/\/en-US\/ref\/center/, { timeout: 15_000 });
  await expect(ref.getByText(msg('en-US').referee.center.timeLabel)).toBeVisible();
});

test('legenda: salvar configuração propaga para outra legenda da sala', async ({ context }) => {
  const room = await createRoom();
  const m = msg('pt-BR').legend;
  const editor = await open(context, urls.legend(room));
  const viewer = await open(context, urls.legend(room));
  await expect(connectedBadge(editor)).toBeVisible({ timeout: 15_000 });
  await expect(connectedBadge(viewer)).toBeVisible({ timeout: 15_000 });

  await editor.getByRole('button', { name: m.buttons.paletteOpen }).click();
  await editor.getByRole('button', { name: m.palette.selectColor.replace('{color}', '#012A4A') }).click();
  await editor.getByRole('button', { name: m.buttons.placeholdersHide }).click();
  await editor.getByRole('button', { name: m.buttons.frameHide }).click();
  await editor.getByRole('button', { name: m.buttons.digits.replace('{mode}', m.digitsModes.hhmmss) }).click();
  await expect(editor.getByText('00:00', { exact: true })).toBeVisible();
  // Salvar grava a configuração na sala, sem modal
  await editor.getByRole('button', { name: new RegExp(`^${m.share.save}`) }).click();
  await expect(editor.getByRole('dialog')).toHaveCount(0);

  // o outro cliente recebe via legend:config
  await expect(viewer.locator('[data-legend-root]')).toHaveCSS('background-color', 'rgb(1, 42, 74)', { timeout: 10_000 });
  await expect(viewer.getByText('00:00', { exact: true })).toBeVisible();
  await expect(viewer.getByRole('button', { name: m.buttons.frameShow })).toBeVisible();
  await expect(viewer.getByRole('button', { name: m.buttons.placeholdersShow })).toBeVisible();
});

test('legenda: link de compartilhamento esconde os controles e aplica os parâmetros', async ({ context }) => {
  const room = await createRoom();
  const m = msg('pt-BR').legend;
  const share = await open(
    context,
    urls.legend(room, '&view=share&legendBg=%23000000&legendTimer=%23FF0000&legendDigits=mmss&legendPlaceholders=0&legendFrame=0')
  );
  await expect(share.getByText('00:00', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(share.getByRole('button', { name: new RegExp(`^${m.share.save}`) })).toHaveCount(0);
  await expect(share.getByText('00:00', { exact: true })).toHaveCSS('color', 'rgb(255, 0, 0)');
  await expect(share.locator('[data-legend-root]')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
});

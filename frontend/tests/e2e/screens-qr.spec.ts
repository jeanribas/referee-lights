// QR codes dos árbitros fora do admin (timer e display): mostram os links
// ATUAIS da sala — nada é regenerado e quem está conectado continua.
// Mais o canal de erros das telas (POST /client-errors).
import { connectedBadge, createRoom, expect, msg, open, test, urls, type Judge, type RoomResponse } from './helpers';

const m = msg('pt-BR');

async function qrHrefs(dialog: import('@playwright/test').Locator) {
  const out: Partial<Record<Judge, string>> = {};
  for (const judge of ['left', 'center', 'right'] as const) {
    const text = await dialog.locator(`[data-qr-target="${judge}"]`).getByText(/\/ref\//).textContent();
    out[judge] = text ?? '';
  }
  return out as Record<Judge, string>;
}

function expectSameTokens(hrefs: Record<Judge, string>, room: RoomResponse) {
  for (const judge of ['left', 'center', 'right'] as const) {
    const url = new URL(hrefs[judge]);
    expect(url.pathname).toBe(`/ref/${judge}`);
    expect(url.searchParams.get('roomId')).toBe(room.roomId);
    expect(url.searchParams.get('token')).toBe(room.joinQRCodes[judge].token);
  }
}

test('timer: botão QR mostra os 3 links atuais sem derrubar o árbitro conectado', async ({ page, context }) => {
  const room = await createRoom();
  const ref = await open(context, urls.ref(room, 'left'));
  await expect(connectedBadge(ref)).toBeVisible({ timeout: 15_000 });

  await page.goto(urls.timer(room));
  await expect(connectedBadge(page)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: m.admin.preview.showQr }).click();
  const dialog = page.getByRole('dialog', { name: m.admin.qrMenu.ariaLabel });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-qr-target]')).toHaveCount(3);
  // só o admin regenera links
  await expect(dialog.getByRole('button', { name: m.admin.qrMenu.regenerate })).toHaveCount(0);
  expectSameTokens(await qrHrefs(dialog), room);

  // o árbitro conectado antes continua votando normalmente
  await ref.getByRole('button', { name: /good lift/i }).click();
  await expect(connectedBadge(ref)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('display: item do menu mostra os 3 links atuais', async ({ page }) => {
  const room = await createRoom();
  await page.goto(urls.display(room));
  await page.getByRole('button', { name: m.display.menu.toggleButton }).click();
  await page.getByRole('button', { name: m.display.menu.showQr }).click();
  const dialog = page.getByRole('dialog', { name: m.admin.qrMenu.ariaLabel });
  await expect(dialog.locator('[data-qr-target]')).toHaveCount(3);
  expectSameTokens(await qrHrefs(dialog), room);
  await dialog.getByRole('button', { name: m.common.srOnly.close }).click();
  await expect(dialog).toHaveCount(0);
});

test('timer em celular em pé: topo cabe e o QR abre um árbitro por vez', async ({ browser }) => {
  const room = await createRoom();
  const context = await browser.newContext({ viewport: { width: 320, height: 640 } });
  const page = await context.newPage();
  await page.goto(urls.timer(room));
  const qrButton = page.getByRole('button', { name: m.admin.preview.showQr });
  await expect(qrButton).toBeVisible({ timeout: 15_000 });
  const box = await qrButton.boundingBox();
  expect(box && box.x + box.width).toBeLessThanOrEqual(320);
  await qrButton.click();
  const dialog = page.getByRole('dialog', { name: m.admin.qrMenu.ariaLabel });
  await dialog.getByRole('tab', { name: m.admin.qrMenu.shortTargets.right }).click();
  await expect(dialog.locator('[data-qr-target="right"]')).toBeVisible();
  await expect(dialog.locator('[data-qr-target="left"]')).toBeHidden();
  await context.close();
});

test('erro solto numa tela vai para POST /client-errors', async ({ page }) => {
  const room = await createRoom();
  await page.goto(urls.timer(room));
  await expect(connectedBadge(page)).toBeVisible({ timeout: 15_000 });
  const sent = page.waitForRequest((req) => req.url().endsWith('/client-errors') && req.method() === 'POST');
  await page.evaluate(() => {
    window.dispatchEvent(new ErrorEvent('error', { error: new TypeError('e2e: erro de teste'), message: 'e2e: erro de teste' }));
  });
  const req = await sent;
  const body = JSON.parse(req.postData() ?? '{}');
  expect(body).toMatchObject({ kind: 'TypeError', message: 'e2e: erro de teste', screen: 'timer' });
  const res = await req.response();
  expect(res?.status()).toBe(204);
});

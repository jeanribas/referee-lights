// Falhas de acesso: PIN errado, token errado/de outro juiz, parâmetros
// ausentes e sala inexistente. Cada tela precisa mostrar a mensagem certa e
// seguir viva (sem pageerror).
import { createRoom, expect, msg, test, urls } from './helpers';

const m = msg('pt-BR');
const errors = m.common.errors;

test.describe('admin', () => {
  test('PIN errado mostra erro e mantém o formulário', async ({ page, allowIssue }) => {
    allowIssue(/403 POST .*\/access|status of 403/);
    const room = await createRoom();
    await page.goto(`/admin?roomId=${room.roomId}&pin=0000`);
    await expect(page.getByText(errors.invalid_pin)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: m.admin.roomSetup.join.submit })).toBeVisible();
  });

  test('sala inexistente mostra "sala não encontrada"', async ({ page, allowIssue }) => {
    allowIssue(/404 POST .*\/access|status of 404/);
    await page.goto('/admin?roomId=ZZZZZZ&pin=1234');
    await expect(page.getByText(errors.room_not_found)).toBeVisible({ timeout: 15_000 });
  });

  test('sem parâmetros mostra a tela de configuração', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('button', { name: m.admin.roomSetup.create.cta })).toBeVisible();
  });
});

test.describe('display / timer / legenda', () => {
  test('display sem parâmetros mostra instrução', async ({ page }) => {
    await page.goto('/display');
    await expect(page.getByRole('heading', { name: m.display.missing.title })).toBeVisible();
  });

  test('display com PIN errado mostra erro', async ({ page }) => {
    const room = await createRoom();
    await page.goto(`/display?roomId=${room.roomId}&pin=0000`);
    await expect(page.getByText(errors.invalid_pin)).toBeVisible({ timeout: 15_000 });
  });

  test('display em sala inexistente mostra erro', async ({ page }) => {
    await page.goto('/display?roomId=ZZZZZZ&pin=1234');
    await expect(page.getByText(errors.room_not_found)).toBeVisible({ timeout: 15_000 });
  });

  test('timer sem parâmetros e com PIN errado', async ({ page }) => {
    await page.goto('/timer');
    await expect(page.getByRole('heading', { name: m.display.missing.title })).toBeVisible();
    const room = await createRoom();
    await page.goto(`/timer?roomId=${room.roomId}&pin=0000`);
    await expect(page.getByText(errors.invalid_pin)).toBeVisible({ timeout: 15_000 });
  });

  test('legenda sem parâmetros e com PIN errado', async ({ page }) => {
    await page.goto('/legend');
    await expect(page.getByText(m.legend.missingCredentials)).toBeVisible();
    const room = await createRoom();
    await page.goto(`/legend?roomId=${room.roomId}&pin=0000`);
    await expect(page.getByText(`${m.legend.errorPrefix} ${errors.invalid_pin}`)).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('árbitro', () => {
  test('sem token mostra console indisponível', async ({ page }) => {
    await page.goto('/ref/left');
    await expect(page.getByRole('heading', { name: m.referee.missing.title })).toBeVisible();
    await page.goto('/ref/center?roomId=ABCD');
    await expect(page.getByRole('heading', { name: m.referee.missing.title })).toBeVisible();
  });

  test('token errado mostra erro e desabilita botões', async ({ page }) => {
    const room = await createRoom();
    await page.goto(`/ref/left?roomId=${room.roomId}&token=errado`);
    await expect(page.getByText(errors.invalid_token)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'GOOD LIFT' })).toBeDisabled();
  });

  test('token de outro juiz é recusado', async ({ page }) => {
    const room = await createRoom();
    await page.goto(`/ref/right?roomId=${room.roomId}&token=${room.joinQRCodes.left.token}`);
    await expect(page.getByText(errors.invalid_token)).toBeVisible({ timeout: 15_000 });
  });

  test('sala inexistente', async ({ page }) => {
    await page.goto('/ref/center?roomId=ZZZZZZ&token=abc');
    await expect(page.getByText(errors.room_not_found)).toBeVisible({ timeout: 15_000 });
  });

  test('links antigos param de funcionar depois de "gerar novos links" no admin', async ({ page, context }) => {
    const room = await createRoom();
    const ref = await context.newPage();
    await ref.goto(urls.ref(room, 'left'));
    await expect(ref.getByText(`${m.common.labels.status}: connected`)).toBeVisible({ timeout: 15_000 });

    await page.goto(urls.admin(room));
    await page.getByRole('button', { name: m.admin.preview.showQr }).click();
    await expect(page.getByRole('dialog', { name: m.admin.qrMenu.ariaLabel })).toBeVisible();
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: m.admin.qrMenu.regenerate }).click();
    // o href do QR do juiz esquerdo muda
    await expect(page.getByText(room.joinQRCodes.left.token)).toHaveCount(0, { timeout: 10_000 });

    // recarregar com o token antigo é recusado
    await ref.reload();
    await expect(ref.getByText(errors.invalid_token)).toBeVisible({ timeout: 15_000 });
  });
});

// Cenários de pista: árbitro recarrega no meio da tentativa, várias salas
// em paralelo sem vazamento e consoles em viewport de celular.
import { devices } from '@playwright/test';

import { JUDGES, createRoom, expect, msg, open, refButtons, test, urls } from './helpers';

const m = msg('pt-BR');
// defaultBrowserType só pode ser definido no topo/config; o resto do perfil serve
const { defaultBrowserType: _browser, ...pixel7 } = devices['Pixel 7'];
void _browser;

test('árbitro recarrega no meio da tentativa: voto preservado e revelação segue', async ({ context }) => {
  const room = await createRoom();
  const display = await open(context, urls.display(room));
  const [left, center, right] = await Promise.all(JUDGES.map((j) => open(context, urls.ref(room, j))));
  for (const r of [left, center, right]) {
    await expect(r.getByText(`${m.common.labels.status}: ${m.common.connection.connected}`)).toBeVisible({ timeout: 15_000 });
  }

  await refButtons(left).card(2).click();
  await expect(refButtons(left).card(2)).toHaveText('✓');
  await refButtons(center).valid.click();
  await expect(refButtons(center).valid).toHaveClass(/ring-4/);

  await left.reload();
  await expect(left.getByText(`${m.common.labels.status}: ${m.common.connection.connected}`)).toBeVisible({ timeout: 15_000 });
  // estado do servidor volta para o console recarregado
  await expect(refButtons(left).card(2)).toHaveText('✓');

  await refButtons(right).valid.click();
  await expect(display.locator('main').getByText('✓', { exact: true })).toHaveCount(2, { timeout: 10_000 });
  await expect(display.locator('main').getByText('✕', { exact: true })).toHaveCount(1);
});

test('fechar a aba do árbitro apaga a luz dele no display e reconectar acende', async ({ context }) => {
  const room = await createRoom();
  const legend = await open(context, urls.legend(room, '&legendPlaceholders=0'));
  await expect(legend.getByText(new RegExp(`: ${m.common.connection.connected}`))).toBeVisible({ timeout: 15_000 });
  const ref = await open(context, urls.ref(room, 'right'));
  await expect(ref.getByText(`${m.common.labels.status}: ${m.common.connection.connected}`)).toBeVisible({ timeout: 15_000 });
  const placeholders = legend.locator('main').getByText('—', { exact: true });
  await expect(placeholders).toHaveCount(1, { timeout: 10_000 });
  await ref.close();
  await expect(placeholders).toHaveCount(0, { timeout: 10_000 });
  const again = await open(context, urls.ref(room, 'right'));
  await expect(again.getByText(`${m.common.labels.status}: ${m.common.connection.connected}`)).toBeVisible({ timeout: 15_000 });
  await expect(placeholders).toHaveCount(1, { timeout: 10_000 });
});

test('duas salas em paralelo não se misturam', async ({ context }) => {
  const a = await createRoom();
  const b = await createRoom();
  const displayA = await open(context, urls.display(a));
  const displayB = await open(context, urls.display(b));
  const refsA = await Promise.all(JUDGES.map((j) => open(context, urls.ref(a, j))));
  const refB = await open(context, urls.ref(b, 'left'));
  for (const r of [...refsA, refB]) {
    await expect(r.getByText(`${m.common.labels.status}: ${m.common.connection.connected}`)).toBeVisible({ timeout: 15_000 });
  }
  // token da sala A não abre a sala B
  const intruder = await open(context, `/ref/left?roomId=${b.roomId}&token=${a.joinQRCodes.left.token}`);
  await expect(intruder.getByText(m.common.errors.invalid_token)).toBeVisible({ timeout: 15_000 });

  for (const r of refsA) await refButtons(r).card(1).click();
  await expect(displayA.locator('main').getByText('✕', { exact: true })).toHaveCount(3, { timeout: 10_000 });
  await displayB.waitForTimeout(2000);
  await expect(displayB.locator('main').getByText('✕', { exact: true })).toHaveCount(0);
  await expect(refButtons(refB).card(1)).toHaveText('1');
});

test.describe('celular', () => {
  test.use(pixel7);

  for (const judge of JUDGES) {
    test(`console ${judge} cabe na tela e vota pelo toque`, async ({ page }) => {
      const room = await createRoom();
      await page.goto(urls.ref(room, judge));
      await expect(page.getByText(`${m.common.labels.status}: ${m.common.connection.connected}`)).toBeVisible({ timeout: 15_000 });
      const b = refButtons(page);
      for (const btn of [b.valid, b.card(1), b.card(2), b.card(3)]) {
        await expect(btn).toBeInViewport();
      }
      // sem rolagem horizontal
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await b.card(3).tap();
      await expect(b.card(3)).toHaveText('✓');
      await b.valid.tap();
      await expect(b.valid).toHaveClass(/ring-4/);
    });
  }

  test('home e admin em celular renderizam sem rolagem horizontal', async ({ page }) => {
    for (const path of ['/', '/faq', '/windows', '/admin']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(1);
    }
  });
});

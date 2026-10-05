// Cronômetro oficial (admin, tela /timer e árbitro central) e intervalo
// entre rounds (definir/iniciar/pausar/mostrar/ocultar/reset).
import { createRoom, expect, msg, open, test, urls } from './helpers';

const m = msg('pt-BR');

test('timer pelo admin: definir 2 min, parar, reset 1:00 — refletido no display e no central', async ({ page, context }) => {
  const room = await createRoom();
  await page.goto(urls.admin(room));
  await expect(page.getByText(`${m.common.labels.status}: connected`)).toBeVisible({ timeout: 15_000 });
  const display = await open(context, urls.display(room));
  const center = await open(context, urls.ref(room, 'center'));
  await expect(display.getByText('1:00').first()).toBeVisible({ timeout: 15_000 });

  await page.locator('input[type="number"]').first().fill('2');
  await page.getByRole('button', { name: m.admin.timer.set, exact: true }).first().click();
  // começa a contar a partir de 2:00
  await expect(display.getByText(/^1:5\d$/).first()).toBeVisible({ timeout: 10_000 });
  await expect(center.getByText(/^1:5\d$/).first()).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: m.admin.timer.stop, exact: true }).click();
  const frozen = await center.locator('text=/^1:5\\d$/').first().textContent();
  await page.waitForTimeout(1500);
  await expect(center.getByText(frozen!, { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: m.admin.timer.resetDefault }).click();
  await expect(display.getByText('1:00').first()).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: m.admin.timer.start, exact: true }).click();
  await expect(display.getByText(/^0:5\d$/).first()).toBeVisible({ timeout: 10_000 });
});

test('timer pelo árbitro central: iniciar, pausar, resetar', async ({ context }) => {
  const room = await createRoom();
  const display = await open(context, urls.display(room));
  const center = await open(context, urls.ref(room, 'center'));
  await expect(center.getByText(`${m.common.labels.status}: connected`)).toBeVisible({ timeout: 15_000 });

  await center.getByRole('button', { name: m.referee.center.start }).click();
  await expect(display.getByText(/^0:5\d$/).first()).toBeVisible({ timeout: 10_000 });
  await center.getByRole('button', { name: m.referee.center.pause }).click();
  await expect(center.getByRole('button', { name: m.referee.center.pause })).toHaveClass(/ring-4/);
  await center.getByRole('button', { name: m.referee.center.reset }).click();
  await expect(display.getByText('1:00').first()).toBeVisible({ timeout: 10_000 });
});

test('árbitros laterais não têm controle de tempo', async ({ context }) => {
  const room = await createRoom();
  const left = await open(context, urls.ref(room, 'left'));
  await expect(left.getByText(`${m.common.labels.status}: connected`)).toBeVisible({ timeout: 15_000 });
  await expect(left.getByRole('button', { name: m.referee.center.start })).toHaveCount(0);
});

test('tela /timer controla cronômetro e intervalo', async ({ context }) => {
  const room = await createRoom();
  const timer = await open(context, urls.timer(room));
  const display = await open(context, urls.display(room));
  await expect(display.getByText('1:00').first()).toBeVisible({ timeout: 15_000 });

  await timer.getByRole('button', { name: m.admin.timer.start, exact: true }).click();
  await expect(display.getByText(/^0:5\d$/).first()).toBeVisible({ timeout: 10_000 });
  await timer.getByRole('button', { name: m.admin.timer.resetDefault }).click();
  await expect(display.getByText('1:00').first()).toBeVisible({ timeout: 10_000 });

  // intervalo de 10 min (valores padrão do formulário): Definir não troca o display
  await timer.getByRole('button', { name: m.admin.interval.set, exact: true }).nth(1).click();
  await expect(timer.locator(`[aria-label="${m.admin.interval.remaining}"]`)).toHaveText('00:10:00', { timeout: 10_000 });
  await expect(display.getByText(m.display.interval.primaryLabel)).toHaveCount(0);

  // Iniciar pede confirmação: cancelar não muda nada
  await timer.getByRole('button', { name: m.admin.interval.start }).click();
  await timer.getByRole('button', { name: m.admin.interval.cancel }).click();
  await timer.waitForTimeout(800);
  await expect(display.getByText(m.display.interval.primaryLabel)).toHaveCount(0);

  // confirmado → display em tela cheia
  await timer.getByRole('button', { name: m.admin.interval.start }).click();
  await timer.getByRole('button', { name: m.admin.interval.confirmStart }).click();
  await expect(display.getByText(m.display.interval.primaryLabel)).toBeVisible({ timeout: 10_000 });

  // Resetar (confirmado) → display volta para as luzes
  await timer.getByRole('button', { name: m.admin.interval.reset }).click();
  await timer.getByRole('button', { name: m.admin.interval.confirmReset }).click();
  await expect(display.getByText(m.display.interval.primaryLabel)).toHaveCount(0, { timeout: 10_000 });
});

test('intervalo pelo admin: definir, iniciar, pausar, reset — display e legenda', async ({ page, context }) => {
  const room = await createRoom();
  await page.goto(urls.admin(room));
  await expect(page.getByText(`${m.common.labels.status}: connected`)).toBeVisible({ timeout: 15_000 });
  const display = await open(context, urls.display(room));
  const legend = await open(context, urls.legend(room, '&legendDigits=hhmmss'));
  await expect(display.getByText('1:00').first()).toBeVisible({ timeout: 15_000 });
  const remaining = page.locator(`[aria-label="${m.admin.interval.remaining}"]`);

  const inputs = page.locator('input[type="number"]');
  await inputs.nth(1).fill('0'); // horas
  await inputs.nth(2).fill('5'); // minutos
  await inputs.nth(3).fill('30'); // segundos
  await page.getByRole('button', { name: m.admin.interval.set, exact: true }).nth(1).click();
  await expect(remaining).toHaveText('00:05:30', { timeout: 10_000 });
  // Definir não troca o display: só Iniciar mostra o intervalo
  await expect(display.getByText(m.display.interval.primaryLabel)).toHaveCount(0);

  await page.getByRole('button', { name: m.admin.interval.start }).click();
  await page.getByRole('button', { name: m.admin.interval.confirmStart }).click();
  await expect(display.getByText(m.display.interval.primaryLabel)).toBeVisible({ timeout: 10_000 });
  await expect(legend.getByText(/^0:05:[23]\d$/)).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: m.admin.interval.pause }).click();
  const frozen = await remaining.textContent();
  await page.waitForTimeout(1200);
  await expect(remaining).toHaveText(frozen!);

  // Resetar: tempo volta ao configurado e o display volta para as luzes
  await page.getByRole('button', { name: m.admin.interval.reset }).click();
  await page.getByRole('button', { name: m.admin.interval.confirmReset }).click();
  await expect(remaining).toHaveText('00:05:30', { timeout: 10_000 });
  await expect(display.getByText(m.display.interval.primaryLabel)).toHaveCount(0, { timeout: 10_000 });
});

// Fluxo completo de uma competição: sala criada, admin + display + legenda +
// timer + 3 árbitros conectados, votos brancos/vermelhos, cartões 1/2/3,
// revelação no 3º voto e comandos ready/release/clear do admin.
import type { Page } from '@playwright/test';

import {
  JUDGES,
  adminSocket,
  createRoom,
  emitAck,
  expect,
  msg,
  open,
  refButtons,
  test,
  urls,
  type Judge
} from './helpers';

const m = msg('pt-BR');

/** Quantos quadrados de luz mostram o símbolo (✓ branco, ✕ vermelho). */
function symbol(page: Page, s: '✓' | '✕') {
  return page.locator('main').getByText(s, { exact: true });
}

test('competição completa: 5 telas + 3 árbitros, votos, cartões e revelação', async ({ page, context }) => {
  test.setTimeout(120_000);
  const room = await createRoom();

  await page.goto(urls.admin(room));
  await expect(page.getByText(`${m.common.labels.room}: ${room.roomId}`)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(`${m.common.labels.status}: connected`)).toBeVisible();

  const display = await open(context, urls.display(room));
  const legend = await open(context, urls.legend(room));
  const timer = await open(context, urls.timer(room));
  await expect(display.getByText('1:00').first()).toBeVisible({ timeout: 15_000 });
  await expect(legend.getByText(`${m.common.labels.status}: connected`)).toBeVisible({ timeout: 15_000 });
  await expect(timer.getByRole('heading', { name: m.admin.timer.title })).toBeVisible();

  const refs = {} as Record<Judge, Page>;
  for (const judge of JUDGES) {
    refs[judge] = await open(context, urls.ref(room, judge));
    await expect(refs[judge].getByText(`${m.common.labels.status}: connected`)).toBeVisible({ timeout: 15_000 });
  }

  // Votos parciais NÃO aparecem no display (só depois dos 3)
  await refButtons(refs.left).valid.click();
  await expect(refButtons(refs.left).valid).toHaveClass(/ring-4/);
  await refButtons(refs.center).card(2).click(); // cartão azul = vermelho + 2
  await expect(refButtons(refs.center).card(2)).toHaveText('✓');
  await display.waitForTimeout(500);
  await expect(symbol(display, '✓')).toHaveCount(0);
  await expect(symbol(display, '✕')).toHaveCount(0);

  // Terceiro voto revela (com o atraso de 1,5s do display)
  await refButtons(refs.right).card(1).click();
  await refButtons(refs.right).card(3).click();
  await expect(symbol(display, '✓')).toHaveCount(1, { timeout: 10_000 });
  await expect(symbol(display, '✕')).toHaveCount(2);
  await expect(symbol(legend, '✓')).toHaveCount(1, { timeout: 10_000 });
  await expect(symbol(legend, '✕')).toHaveCount(2);
  // cartões revelados aparecem na faixa do display (vermelho, azul, amarelo)
  await expect(display.locator('main .bg-blue-500')).toHaveCount(1);
  await expect(display.locator('main .bg-yellow-400')).toHaveCount(1);
  // admin também revela no preview
  await expect(symbol(page, '✕')).toHaveCount(2, { timeout: 10_000 });

  // admin:clear (sem botão na UI — vem do key relay/automação) zera tudo
  const sock = await adminSocket(room);
  expect(await emitAck(sock, 'admin:clear')).toEqual({ ok: true });
  await expect(symbol(display, '✕')).toHaveCount(0, { timeout: 10_000 });
  await expect(refButtons(refs.left).valid).not.toHaveClass(/ring-4/);
  await expect(refButtons(refs.center).card(2)).toHaveText('2');

  // admin:release força a revelação com um voto só
  await refButtons(refs.left).card(1).click();
  await expect(refButtons(refs.left).card(1)).toHaveText('✓');
  expect(await emitAck(sock, 'admin:release')).toEqual({ ok: true });
  await expect(symbol(display, '✕')).toHaveCount(1, { timeout: 10_000 });
  await expect(symbol(display, '✓')).toHaveCount(0);

  // admin:ready prepara a próxima tentativa
  expect(await emitAck(sock, 'admin:ready')).toEqual({ ok: true });
  await expect(symbol(display, '✕')).toHaveCount(0, { timeout: 10_000 });
  sock.disconnect();
});

test('árbitro desfaz voto: GOOD LIFT 2x limpa; cartão ativo 2x remove; troca branco→vermelho', async ({ context }) => {
  const room = await createRoom();
  const ref = await open(context, urls.ref(room, 'left'));
  const b = refButtons(ref);
  await expect(ref.getByText(`${m.common.labels.status}: connected`)).toBeVisible({ timeout: 15_000 });

  await b.valid.click();
  await expect(b.valid).toHaveClass(/ring-4/);
  await b.valid.click();
  await expect(b.valid).not.toHaveClass(/ring-4/);

  await b.card(1).click();
  await b.card(2).click();
  await b.card(3).click();
  for (const n of [1, 2, 3] as const) await expect(b.card(n)).toHaveText('✓');
  await b.card(2).click();
  await expect(b.card(2)).toHaveText('2');

  // GOOD LIFT depois de cartões limpa os cartões
  await b.valid.click();
  await expect(b.valid).toHaveClass(/ring-4/);
  await expect(b.card(1)).toHaveText('1');
  await expect(b.card(3)).toHaveText('3');
});

test('revelação some sozinha após ~10s (auto-clear do servidor)', async ({ context }) => {
  test.setTimeout(60_000);
  const room = await createRoom();
  const display = await open(context, urls.display(room));
  const refs = await Promise.all(JUDGES.map((j) => open(context, urls.ref(room, j))));
  for (const r of refs) await expect(r.getByText(`${m.common.labels.status}: connected`)).toBeVisible({ timeout: 15_000 });
  for (const r of refs) await refButtons(r).valid.click();
  await expect(symbol(display, '✓')).toHaveCount(3, { timeout: 10_000 });
  await expect(symbol(display, '✓')).toHaveCount(0, { timeout: 15_000 });
});

// Legenda (pedidos do Jean, 08/out): "Copiar link" salva e copia o link do
// OBS sem modal; o link abre a mesma tela com a barra, e mexer na barra de
// qualquer uma salva na sala na hora (a outra acompanha).
import { connectedBadge, createRoom, expect, msg, open, test, urls } from './helpers';

test('legenda: Copiar link salva, copia e não abre modal', async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const room = await createRoom('pt-BR');
  const m = msg('pt-BR').legend;
  const editor = await open(context, urls.legend(room));
  const viewer = await open(context, urls.legend(room));
  await expect(connectedBadge(editor)).toBeVisible({ timeout: 15_000 });

  await editor.getByRole('button', { name: m.buttons.placeholdersHide }).click();
  await editor.getByRole('button', { name: new RegExp(`^${m.share.copy}`) }).click();

  await expect(editor.getByRole('button', { name: new RegExp(`^${m.share.copied}`) })).toBeVisible();
  await expect(editor.getByRole('dialog')).toHaveCount(0);
  expect(await editor.evaluate(() => navigator.clipboard.readText())).toContain(`/legend?roomId=${room.roomId}`);
  // salvou: a outra legenda da sala recebe a configuração
  await expect(viewer.getByRole('button', { name: m.buttons.placeholdersShow })).toBeVisible({ timeout: 10_000 });
});

test('legenda: mudança feita em uma tela vale na hora para a outra (admin × OBS)', async ({ context }) => {
  const room = await createRoom('pt-BR');
  const m = msg('pt-BR').legend;
  const admin = await open(context, urls.legend(room));
  const obs = await open(context, urls.legend(room));
  await expect(connectedBadge(admin)).toBeVisible({ timeout: 15_000 });
  await expect(connectedBadge(obs)).toBeVisible({ timeout: 15_000 });
  // no "OBS", sem clicar em salvar: tira a moldura → o admin acompanha
  await obs.getByRole('button', { name: m.buttons.frameHide }).click();
  await expect(admin.getByRole('button', { name: m.buttons.frameShow })).toBeVisible({ timeout: 10_000 });
  // e o contrário: dígitos no admin → OBS acompanha
  await admin.getByRole('button', { name: m.buttons.digits.replace('{mode}', m.digitsModes.hhmmss) }).click();
  await expect(obs.getByText('00:00', { exact: true })).toBeVisible({ timeout: 10_000 });
});

test('legenda: abrir a tela (OBS novo, sem nada salvo no navegador) não muda a configuração da sala', async ({ context }) => {
  const room = await createRoom('pt-BR');
  const m = msg('pt-BR').legend;
  const admin = await open(context, urls.legend(room));
  await expect(connectedBadge(admin)).toBeVisible({ timeout: 15_000 });
  await admin.getByRole('button', { name: m.buttons.frameHide }).click();
  await expect(admin.getByRole('button', { name: m.buttons.frameShow })).toBeVisible();
  // navegador "limpo" (outro contexto, como a fonte do OBS)
  const fresh = await context.browser()!.newContext();
  const obs = await fresh.newPage();
  await obs.goto(urls.legend(room));
  await expect(connectedBadge(obs)).toBeVisible({ timeout: 15_000 });
  await obs.waitForTimeout(1500);
  await expect(obs.getByRole('button', { name: m.buttons.frameShow })).toBeVisible();
  await expect(admin.getByRole('button', { name: m.buttons.frameShow })).toBeVisible();
  await fresh.close();
});

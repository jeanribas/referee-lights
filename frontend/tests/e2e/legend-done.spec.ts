// Botão principal da legenda: "Copiar link" salva a configuração e copia o
// link do OBS de uma vez, sem modal (pedido do Jean, 08/out).
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

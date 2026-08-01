import { expect, test, type Page } from '@playwright/test';

const API_BASE_URL = process.env.E2E_API_URL ?? 'http://localhost:3333';

interface RoomResponse {
  roomId: string;
  adminPin: string;
  joinQRCodes: {
    left: { token: string };
    center: { token: string };
    right: { token: string };
  };
}

// Asserts em texto neutro de locale: roomId, o status bruto ("connected") e o
// jargão "GOOD LIFT", idêntico em pt-BR/en-US/es-ES. A sala nasce em pt-BR e
// sincroniza o locale dos clientes via socket, então strings traduzidas são
// instáveis aqui.
test('platform smoke: sala criada, 5 clientes conectam e votos sincronizam', async ({
  page,
  context,
  request
}) => {
  const creation = await request.post(`${API_BASE_URL}/rooms`, { data: {} });
  expect(creation.ok()).toBeTruthy();
  const payload = (await creation.json()) as RoomResponse;

  const adminPage = page;
  await adminPage.goto(`/admin?roomId=${payload.roomId}&pin=${payload.adminPin}`);
  await expect(adminPage.getByText(payload.roomId).first()).toBeVisible({ timeout: 15_000 });
  await expect(adminPage.getByText('connected').first()).toBeVisible({ timeout: 10_000 });

  const displayPage = await context.newPage();
  await displayPage.goto(`/display?roomId=${payload.roomId}&pin=${payload.adminPin}`);
  // O display não tem texto de marca visível; o timer sincronizado (1:00
  // default) prova que a tela conectou e recebeu estado da sala.
  await expect(displayPage.getByText('1:00').first()).toBeVisible({ timeout: 15_000 });

  const judges = ['left', 'center', 'right'] as const;
  const refPages: Record<(typeof judges)[number], Page> = {} as never;
  for (const judge of judges) {
    const refPage = await context.newPage();
    await refPage.goto(
      `/ref/${judge}?roomId=${payload.roomId}&token=${payload.joinQRCodes[judge].token}`
    );
    await expect(refPage.getByRole('button', { name: 'GOOD LIFT' })).toBeVisible({
      timeout: 15_000
    });
    refPages[judge] = refPage;
  }

  // Cada voto só ativa o destaque (ring) quando o servidor ecoa o estado de
  // volta pelo socket — isso valida o ciclo completo cliente → API → broadcast.
  for (const judge of judges) {
    const validButton = refPages[judge].getByRole('button', { name: 'GOOD LIFT' });
    await validButton.click();
    await expect(validButton).toHaveClass(/ring-4/, { timeout: 10_000 });
  }
});

// Wake lock das telas de longa duração: focus/visibilitychange repetidos não
// podem acumular sentinels (antes cada evento pedia um lock novo e só o último
// era liberado ao desligar o keepAwake).
import { createRoom, expect, test, urls } from './helpers';

test('display: focos repetidos mantêm um único wake lock ativo', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __wl: { requests: number; active: number } };
    w.__wl = { requests: 0, active: 0 };
    const fake = {
      request: async () => {
        w.__wl.requests += 1;
        w.__wl.active += 1;
        const sentinel = {
          released: false,
          addEventListener: () => undefined,
          release: async () => {
            if (!sentinel.released) {
              sentinel.released = true;
              w.__wl.active -= 1;
            }
          }
        };
        return sentinel;
      }
    };
    Object.defineProperty(navigator, 'wakeLock', { value: fake, configurable: true });
  });
  const room = await createRoom();
  await page.goto(urls.display(room));
  await expect.poll(() => page.evaluate(() => (window as unknown as { __wl: { active: number } }).__wl.active)).toBe(1);
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  }
  await page.waitForTimeout(300);
  const wl = await page.evaluate(() => (window as unknown as { __wl: { requests: number; active: number } }).__wl);
  expect(wl.active).toBe(1);
  expect(wl.requests).toBe(1);
});

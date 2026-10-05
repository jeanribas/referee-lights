// Matriz da marca: o nome "REFEREE LIGHTS" tem SEMPRE a largura exata da
// fileira de luzes, com qualquer fonte do sistema (Segoe, SF, Arial…).
import { expect, test } from './helpers';

for (const font of ['inherit', 'Arial', '"Arial Narrow", Arial', 'Georgia, serif']) {
  test(`logo: nome na largura das luzes (fonte ${font})`, async ({ page }) => {
    await page.goto('/admin');
    if (font !== 'inherit') await page.addStyleTag({ content: `body, body * { font-family: ${font} !important; }` });
    const logo = page.locator('[role="img"][aria-label="Referee Lights"]').first();
    await expect(logo).toBeVisible({ timeout: 15_000 });
    const { squares, name } = await logo.evaluate((el) => {
      const [row, svg] = Array.from(el.children) as HTMLElement[];
      const text = svg.querySelector('text') as SVGTextElement;
      return { squares: row.getBoundingClientRect().width, name: text.getBoundingClientRect().width };
    });
    expect(Math.abs(name - squares)).toBeLessThanOrEqual(1.5);
  });
}

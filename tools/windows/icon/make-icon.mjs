// Gera os ícones a partir da logo DO PRÓPRIO APP — o componente BrandLogo
// (quadrados + REFEREE LIGHTS), capturado do frontend em alta resolução,
// nada redesenhado — em fundo escuro arredondado:
//   tools/windows/launcher/app.ico   exe, janela do painel, barra de tarefas
//   frontend/public/favicon.ico      16/32/48
//   frontend/public/images/icon-192.png, icon-512.png (atalho/instalação)
//   frontend/public/images/icon.svg  (mesma imagem, para o favicon SVG)
// Uso: com o frontend buildado (npm run build em frontend/):
//   node tools/windows/icon/make-icon.mjs
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const frontendDir = path.join(root, 'frontend');
const require = createRequire(path.join(frontendDir, 'package.json'));
const { chromium } = require('playwright');

const PORT = 3055;
const BG = '#020617'; // fundo das telas (slate-950)
const sizes = [256, 128, 96, 64, 48, 32, 24, 16];

const next = spawn(path.join(frontendDir, 'node_modules', '.bin', 'next'), ['start', '-p', String(PORT)], { cwd: frontendDir, stdio: 'ignore' });
try {
  const base = `http://localhost:${PORT}`;
  for (let i = 0; ; i++) {
    try { if ((await fetch(base)).ok) break; } catch { /* subindo */ }
    if (i > 60) throw new Error('frontend não subiu (rode npm run build em frontend/)');
    await new Promise((r) => setTimeout(r, 500));
  }
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 12 });
  // O topo do timer usa a BrandLogo; sala fictícia (só o desenho importa)
  await page.goto(`${base}/timer?roomId=ICON&pin=0000`);
  const logo = page.locator('[role="img"][aria-label="Referee Lights"]').first();
  await logo.waitFor();
  const fullPng = await logo.screenshot({ omitBackground: true });

  // Monta cada tamanho num canvas: fundo escuro arredondado + logo centralizada
  const render = await browser.newPage();
  const tile = async (size) => {
    const src = fullPng.toString('base64');
    const dataUrl = await render.evaluate(async ({ size, src, bg, small }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${src}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      const r = size * 0.18;
      g.fillStyle = bg;
      g.beginPath();
      g.roundRect(0, 0, size, size, r);
      g.fill();
      const w = size * 0.86;
      const h = (img.height / img.width) * w;
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      return c.toDataURL('image/png');
    }, { size, src, bg: BG });
    return Buffer.from(dataUrl.split(',')[1], 'base64');
  };
  const pngs = [];
  for (const size of sizes) pngs.push({ size, data: await tile(size) });
  const icon192 = await tile(192);
  const icon512 = await tile(512);
  await browser.close();

  const ico = (list) => {
  // ICO com imagens PNG (Windows Vista+): cabeçalho + diretório + dados
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(list.length, 4);
  const dir = Buffer.alloc(16 * list.length);
  let offset = 6 + dir.length;
  list.forEach(({ size, data }, i) => {
    const e = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, e);
    dir.writeUInt8(size >= 256 ? 0 : size, e + 1);
    dir.writeUInt16LE(1, e + 4);
    dir.writeUInt16LE(32, e + 6);
    dir.writeUInt32LE(data.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, dir, ...list.map((p) => p.data)]);
  };
  await writeFile(path.join(root, 'tools', 'windows', 'launcher', 'app.ico'), ico(pngs));
  await writeFile(path.join(frontendDir, 'public', 'favicon.ico'), ico(pngs.filter((p) => [48, 32, 16].includes(p.size))));
  await writeFile(path.join(frontendDir, 'public', 'images', 'icon-192.png'), icon192);
  await writeFile(path.join(frontendDir, 'public', 'images', 'icon-512.png'), icon512);
  await writeFile(
    path.join(frontendDir, 'public', 'images', 'icon.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><image href="data:image/png;base64,${icon512.toString('base64')}" width="512" height="512"/></svg>\n`
  );
  // Prévia para conferir (não vai para o pacote)
  if (process.env.ICON_PREVIEW) {
    for (const { size, data } of pngs) await writeFile(path.join(process.env.ICON_PREVIEW, `icon-${size}.png`), data);
  }
  console.log(`app.ico (${sizes.join(', ')} px), favicon.ico, icon-192/512.png, icon.svg`);
} finally {
  next.kill();
}

#!/usr/bin/env node
/**
 * Trava do piso de navegador (roda depois do `next build`; falhou = build
 * reprovado, inclusive na Vercel).
 *
 * Premissa do projeto: as telas abrem em qualquer navegador. Em ago/2026 uma
 * atualização de dependências (Next 16 + Tailwind 4) subiu o piso para
 * Safari 16.4 / Chrome 111 sem ninguém perceber — iPhone antigo ficava com a
 * tela escura. Isto impede que aconteça de novo:
 *
 *  - JS do app (.next/static): sintaxe até ES2019 (Safari 12 / Chrome 64),
 *    sem lookbehind em regex (Safari só tem desde 16.4)
 *  - telas universais (public/compat/*.js): ES5
 *  - CSS: nada que navegador antigo descarte inteiro (@layer, @property,
 *    color-mix, oklch, rgb com espaço)
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

async function walk(dir, ext) {
  const out = [];
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p, ext)));
    else if (p.endsWith(ext)) out.push(p);
  }
  return out;
}

function checkJs(file, code, ecmaVersion) {
  try {
    parse(code, { ecmaVersion, sourceType: 'script', allowHashBang: true });
  } catch (error) {
    const pos = error.pos ?? 0;
    problems.push(`${path.relative(root, file)}: sintaxe acima de ES${ecmaVersion === 5 ? 5 : ecmaVersion} (${error.message}) … ${code.slice(Math.max(0, pos - 40), pos + 40)}`);
    return;
  }
  if (/\(\?<[=!]/.test(code)) problems.push(`${path.relative(root, file)}: regex com lookbehind (Safari < 16.4 não entende)`);
}

const appJs = await walk(path.join(root, '.next', 'static'), '.js');
if (!appJs.length) problems.push('.next/static sem JS — rode depois do next build');
for (const f of appJs) checkJs(f, await readFile(f, 'utf8'), 2019);

for (const f of await walk(path.join(root, 'public', 'compat'), '.js')) checkJs(f, await readFile(f, 'utf8'), 5);

const BANNED_CSS = [
  [/@layer\b/, '@layer'],
  [/@property\b/, '@property'],
  [/color-mix\(/, 'color-mix()'],
  [/\boklch\(|\boklab\(/, 'oklch/oklab'],
  [/rgba?\(\s*[\d.]+%?\s+[\d.]+%?\s+[\d.]+%?/, 'rgb() com espaço']
];
for (const f of await walk(path.join(root, '.next', 'static'), '.css')) {
  const css = await readFile(f, 'utf8');
  for (const [re, name] of BANNED_CSS) if (re.test(css)) problems.push(`${path.relative(root, f)}: ${name} (navegador antigo descarta)`);
}

if (problems.length) {
  console.error('\n❌ Piso de navegador violado (premissa: qualquer navegador):');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nVeja scripts/check-compat.mjs. Não suba dependência que eleve o piso sem resolver antes.\n');
  process.exit(1);
}
console.log(`✅ piso de navegador ok: ${appJs.length} JS do app até ES2019, telas universais em ES5, CSS sem recurso que navegador antigo descarta`);

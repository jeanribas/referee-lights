#!/usr/bin/env node
/**
 * Telas universais: empacota a tela React do display (src/screens/) em UM
 * arquivo ES5 que roda em navegador antigo (TV que não atualiza, Android 4,
 * iOS velho), sem o runtime do Next.
 *
 *   1. esbuild junta tudo (React + componentes), com next/router, next/link,
 *      next/head e socket.io-client trocados pelos de compat-src/
 *   2. SWC desce para ES5 e marca os polyfills que o código usa (core-js)
 *   3. esbuild junta de novo, agora com os polyfills, e minifica
 *   4. checagem: o resultado tem que ser ES5 (es-check), senão o build falha
 *
 * Saída: public/compat/display.js (gerado, fora do git). Roda antes do
 * `next build` (script prebuild), na Vercel e no pacote Windows.
 */
import { build } from 'esbuild';
import { transform } from '@swc/core';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public', 'compat');
const tmp = path.join(root, '.compat-build');

const ENTRIES = { display: 'compat-src/display-entry.tsx' };

/**
 * Mesmas variáveis que o Next inlina no client: todas as NEXT_PUBLIC_* do
 * ambiente do build (+ as do next.config). `process.env` inteiro vira um
 * objeto fixo — variável ausente é undefined, como no Next, e não um
 * "process is not defined" no navegador.
 */
const env = { NODE_ENV: 'production', NEXT_PUBLIC_BUNDLE_TARGET: process.env.BUNDLE_TARGET ?? '' };
for (const [k, v] of Object.entries(process.env)) if (k.startsWith('NEXT_PUBLIC_')) env[k] = v;
const define = { 'process.env': JSON.stringify(env), 'process.env.NODE_ENV': '"production"' };

const shim = (file) => path.join(root, 'compat-src', file);
const alias = {
  'next/router': shim('next-router.ts'),
  'next/link': shim('next-link.tsx'),
  'next/head': shim('next-head.tsx'),
  'socket.io-client': shim('socketio.ts')
};

const aliasPlugin = {
  name: 'rl-alias',
  setup(b) {
    b.onResolve({ filter: /^(next\/router|next\/link|next\/head|socket\.io-client)$/ }, (args) => ({ path: alias[args.path] }));
    b.onResolve({ filter: /^@\// }, (args) => b.resolve('./' + args.path.slice(2), { resolveDir: path.join(root, 'src'), kind: args.kind }));
  }
};

async function one(name, entry) {
  // 1. bundle moderno
  const stage1 = path.join(tmp, `${name}.stage1.js`);
  await build({
    entryPoints: [path.join(root, entry)],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2017',
    jsx: 'automatic',
    define,
    plugins: [aliasPlugin],
    outfile: stage1,
    legalComments: 'none',
    logLevel: 'warning'
  });

  // 2. ES5 + polyfills marcados pelo uso. Antes: valor de style que é um
  //    clamp()/min()/max() inteiro passa pelo RL.cssValue (rl.js), que o
  //    calcula em px só em navegador sem suporte.
  const code = (await readFile(stage1, 'utf8')).replace(
    /(["'])((?:clamp|min|max)\((?:(?!\1)[^\\\n])*\))\1/g,
    (_, q, value) => `(window.RL && window.RL.cssValue ? window.RL.cssValue(${q}${value}${q}) : ${q}${value}${q})`
  );
  const es5 = await transform(code, {
    filename: `${name}.js`,
    isModule: false,
    env: {
      targets: { chrome: '30', safari: '7', ios: '7', android: '4', firefox: '30', samsung: '4' },
      mode: 'usage',
      coreJs: '3.50'
    },
    // loose: false — o modo solto troca for...of por laço de array e quebra Set/Map
    jsc: { parser: { syntax: 'ecmascript' }, loose: false, externalHelpers: false },
    module: { type: 'commonjs' }
  });
  const stage2 = path.join(tmp, `${name}.stage2.js`);
  // fetch não é do core-js: entra antes de tudo
  await writeFile(stage2, `require("whatwg-fetch");\n${es5.code}`);

  // 3. junta polyfills + código, minificado
  const file = path.join(out, `${name}.js`);
  await build({
    entryPoints: [stage2],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es5',
    minify: true,
    outfile: file,
    legalComments: 'none',
    logLevel: 'warning',
    nodePaths: [path.join(root, 'node_modules')]
  });

  // 4. tem que ser ES5 de verdade
  const { createRequire } = await import('node:module');
  const acorn = createRequire(import.meta.url)('acorn');
  try {
    acorn.parse(await readFile(file, 'utf8'), { ecmaVersion: 5, sourceType: 'script' });
  } catch (error) {
    throw new Error(`${name}.js não é ES5: ${error.message}`);
  }
  const size = (await readFile(file)).length;
  console.log(`✅ compat/${name}.js (ES5, ${(size / 1024).toFixed(0)} KB)`);
}

await rm(tmp, { recursive: true, force: true });
await mkdir(tmp, { recursive: true });
await mkdir(out, { recursive: true });
for (const [name, entry] of Object.entries(ENTRIES)) await one(name, entry);
await rm(tmp, { recursive: true, force: true });

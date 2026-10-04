#!/usr/bin/env node
// Gera dist/manifest-<canal>.json do canal de atualização a partir do
// RefereeLights.exe e do dist/build-info.json (gravado pelo build). A
// assinatura é feita depois, com a chave do secret:
//   go run ./cmd/signmanifest -sign dist/manifest-<canal>.json
//
// Uso: node make-manifest.mjs --url <download do exe> [--notes-pt ..] [--notes-en ..] [--notes-es ..] [--min-launcher x.y.z]
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const opt = (name, def = '') => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : def);

const info = JSON.parse(readFileSync(path.join(rootDir, 'dist', 'build-info.json'), 'utf8'));
const exe = readFileSync(path.join(rootDir, 'dist', 'RefereeLights.exe'));
const url = opt('--url');
if (!/^https:\/\//.test(url)) {
  console.error('make-manifest: --url https://... obrigatório');
  process.exit(1);
}
const manifest = {
  schema: 1,
  channel: info.channel,
  version: info.version,
  build: info.build,
  published: new Date().toISOString(),
  url,
  size: exe.length,
  sha256: createHash('sha256').update(exe).digest('hex'),
  minLauncher: opt('--min-launcher'),
  notes_pt: opt('--notes-pt', `Versão ${info.version}`),
  notes_en: opt('--notes-en', `Version ${info.version}`),
  notes_es: opt('--notes-es', `Versión ${info.version}`)
};
const out = path.join(rootDir, 'dist', `manifest-${info.channel}.json`);
writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
console.log(`manifesto ${info.channel} ${info.version} (${info.build}) → ${out}`);

#!/usr/bin/env node
// Notifica o Bing (IndexNow) quando páginas indexáveis mudam.
// Uso: node tools/seo/indexnow-ping.mjs [url extra...]
// A chave precisa continuar publicada em https://refereelights.app/<KEY>.txt

const HOST = 'refereelights.app';
const KEY = 'ecb7bb9995b8b1098d78e7f9e7c78a7f';

const defaultUrls = [
  'https://refereelights.app/pt-BR',
  'https://refereelights.app/en-US',
  'https://refereelights.app/es-ES',
  'https://refereelights.app/pt-BR/windows',
  'https://refereelights.app/en-US/windows',
  'https://refereelights.app/es-ES/windows'
];

const urlList = process.argv.length > 2 ? process.argv.slice(2) : defaultUrls;

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    host: HOST,
    key: KEY,
    keyLocation: `https://${HOST}/${KEY}.txt`,
    urlList
  })
});

console.log(`IndexNow: HTTP ${res.status} — ${urlList.length} URL(s) enviadas`);
if (!res.ok) {
  console.error(await res.text());
  process.exit(1);
}

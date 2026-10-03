// Verificação da lista branca e do mapeamento SendKeys do Key Relay.
// Uso: npx tsx scripts/check-key-relay.ts (sai com 1 se algo falhar)
import assert from 'node:assert/strict';
import { isValidKeyCombo, toWinSendKeys } from '../src/key-relay.js';

const ok: Array<[string, string]> = [
  ['F1', '{F1}'], ['f12', '{F12}'], ['Ctrl+Shift+F1', '^+{F1}'], ['alt+a', '%a'],
  ['CTRL+ALT+SHIFT+9', '^%+9'], ['meta+x', 'x'], ['Ctrl + Z', '^z']
];
for (const [combo, seq] of ok) {
  assert.equal(isValidKeyCombo(combo), true, combo);
  assert.equal(toWinSendKeys(combo), seq, combo);
}
const bad = ["x');Start-Process calc;('", 'F13', 'F0', 'ctrl+ctrl+ctrl+ctrl+a', '{ENTER}', 'ab', "'", '%', '~',
  'ctrl+', '+a', 'win+a', 'a'.repeat(40), '', 'é'];
for (const combo of bad) {
  assert.equal(isValidKeyCombo(combo), false, combo);
  assert.equal(toWinSendKeys(combo), null, combo);
}
assert.equal(isValidKeyCombo(42), false);
// Nenhuma sequência gerada contém caractere fora do alfabeto seguro do SendKeys
for (const [combo] of ok) assert.match(toWinSendKeys(combo)!, /^[\^%+]*(\{F\d{1,2}\}|[a-z0-9])$/);
console.log(`OK key relay: ${ok.length} combos válidos mapeados, ${bad.length} rejeitados`);

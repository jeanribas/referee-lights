// Verificação de resolveClientIp/parseTrustProxyHops.
// Uso: npx tsx scripts/check-client-ip.ts
import assert from 'node:assert/strict';
import { parseTrustProxyHops, resolveClientIp } from '../src/client-ip.js';

// Bundle (hops=0): header forjado é ignorado
assert.equal(resolveClientIp('192.168.0.10', '1.2.3.4', 0), '192.168.0.10');
assert.equal(resolveClientIp(undefined, '1.2.3.4', 0), '');
// 1 proxy nosso: valor mais à direita
assert.equal(resolveClientIp('10.0.0.1', 'forjado, 8.8.8.8', 1), '8.8.8.8');
assert.equal(resolveClientIp('10.0.0.1', ['a', 'b, c'], 2), 'b');
assert.equal(resolveClientIp('10.0.0.1', 'x', 3), 'x');
assert.equal(resolveClientIp('10.0.0.1', '', 1), '10.0.0.1');
assert.equal(resolveClientIp('10.0.0.1', undefined, 1), '10.0.0.1');
assert.equal(parseTrustProxyHops(undefined), 0);
assert.equal(parseTrustProxyHops('abc'), 0);
assert.equal(parseTrustProxyHops('-1'), 0);
assert.equal(parseTrustProxyHops('1'), 1);
assert.equal(parseTrustProxyHops('99'), 10);
console.log('OK client-ip');

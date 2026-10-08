import { FlatCompat } from '@eslint/eslintrc';
import prettier from 'eslint-config-prettier';

// Next 15 (eslint-config-next 15) publica a config no formato eslintrc; o
// FlatCompat converte para o flat config do ESLint 9. O lint roda direto pelo
// CLI do ESLint (mesmo modelo do server).
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default [
  { ignores: ['.next/**', 'node_modules/**', 'public/**', 'playwright-report/**', 'test-results/**'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  prettier,
  {
    rules: {
      // Paridade com server/eslint.config.mjs.
      '@typescript-eslint/no-explicit-any': 'off'
    }
  }
];

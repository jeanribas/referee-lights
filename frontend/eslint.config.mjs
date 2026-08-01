import coreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

// Next 16 removeu `next lint`; o lint roda direto pelo CLI do ESLint com o
// flat config nativo do eslint-config-next (mesmo modelo do server).
export default [
  { ignores: ['.next/**', 'node_modules/**', 'public/**', 'playwright-report/**', 'test-results/**'] },
  ...coreWebVitals,
  ...nextTypescript,
  prettier,
  {
    rules: {
      // Paridade com server/eslint.config.mjs.
      '@typescript-eslint/no-explicit-any': 'off',
      // Regras advisory do React Compiler (eslint-config-next 16): as telas de
      // tempo real (master, admin, legend, sockets) usam setState síncrono em
      // effects de sync com localStorage/socket/timers. Adotar exige refatorar
      // tela a tela — follow-up dedicado; não entra no PR de dependências.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/immutability': 'off'
    }
  }
];

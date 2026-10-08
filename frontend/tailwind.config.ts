import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    // Alturas de linha do Tailwind 4 (proporcionais ao tamanho da fonte, ex.
    // calc(1 / 0.75)), já calculadas. O v3 usa rem fixos (text-xs = 1rem) e
    // um filho com outra fonte herdava a altura errada — mudava o layout que
    // está em produção. Número puro em vez de calc() para navegador antigo.
    fontSize: {
      xs: ['0.75rem', { lineHeight: '1.3333333' }],
      sm: ['0.875rem', { lineHeight: '1.4285714' }],
      base: ['1rem', { lineHeight: '1.5' }],
      lg: ['1.125rem', { lineHeight: '1.5555556' }],
      xl: ['1.25rem', { lineHeight: '1.4' }],
      '2xl': ['1.5rem', { lineHeight: '1.3333333' }],
      '3xl': ['1.875rem', { lineHeight: '1.2' }],
      '4xl': ['2.25rem', { lineHeight: '1.1111111' }],
      '5xl': ['3rem', { lineHeight: '1' }],
      '6xl': ['3.75rem', { lineHeight: '1' }],
      '7xl': ['4.5rem', { lineHeight: '1' }],
      '8xl': ['6rem', { lineHeight: '1' }],
      '9xl': ['8rem', { lineHeight: '1' }]
    },
    extend: {
      colors: {
        primary: '#1C64F2',
        good: '#f8fafc',
        bad: '#ef4444',
        judgeRed: '#f87171',
        judgeBlue: '#60a5fa',
        judgeYellow: '#facc15'
      },
      fontFamily: {
        display: ['"Bebas Neue"', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
};

export default config;

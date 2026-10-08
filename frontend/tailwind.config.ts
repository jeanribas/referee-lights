import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  // Cores sem var(--tw-*-opacity): navegador sem variáveis de CSS (Android 4,
  // iOS 9, TVs) descartava a cor inteira. O app não usa as classes
  // bg-opacity-*/text-opacity-* (a opacidade vem do sufixo /50, que continua).
  corePlugins: {
    backgroundOpacity: false,
    textOpacity: false,
    borderOpacity: false,
    divideOpacity: false,
    placeholderOpacity: false,
    ringOpacity: false
  },
  theme: {
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

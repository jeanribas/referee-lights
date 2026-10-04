import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.PORT ?? '3000';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    // Accept-Language fixo: sem isso o i18n do Next redireciona a raiz para o
    // idioma do navegador da máquina e os asserts de pt-BR ficam instáveis.
    locale: 'pt-BR',
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] }
    }
  ]
});

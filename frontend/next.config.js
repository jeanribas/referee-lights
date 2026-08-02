/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  i18n: {
    locales: ['pt-BR', 'en-US', 'es-ES'],
    defaultLocale: 'pt-BR'
  },
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false
  },
  async redirects() {
    // Consolidação de hostname (2026-07-31): o canônico é refereelights.app
    // (domínio próprio do produto). Os subdomínios legados do assist.com.br e o
    // www dão 301 — Bing exige redirect (não só canonical) para host duplicado.
    const aliasHosts = [
      'ipf-ligths.assist.com.br',
      'ligths.assist.com.br',
      'referee.assist.com.br',
      'referee-ligths.assist.com.br',
      'arbitros.assist.com.br',
      'luzes-ipf.assist.com.br',
      'www.refereelights.app'
    ];
    return aliasHosts.map((host) => ({
      source: '/:path*',
      has: [{ type: 'host', value: host }],
      destination: 'https://refereelights.app/:path*',
      permanent: true,
      locale: false
    }));
  },
  async headers() {
    // Telas de app fora do índice: robots.txt Disallow sozinho não desindexa
    // (o Bing chegou a listar /admin) — o header noindex exige crawl liberado,
    // por isso os Disallow correspondentes saíram do robots.txt.
    const noindex = ['/admin', '/display', '/legend', '/timer', '/ref/:path*'];
    return [
      ...noindex.map((source) => ({
        source,
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }]
      })),
      {
        source: '/screenshots/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }
        ]
      },
      {
        source: '/images/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }
        ]
      }
    ];
  }
};

module.exports = nextConfig;

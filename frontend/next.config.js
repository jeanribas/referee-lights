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
  eslint: {
    dirs: ['src']
  },
  async redirects() {
    // Consolidação de hostname (2026-07-31): o canônico é refereelights.app
    // (domínio próprio do produto). Os 5 subdomínios legados do assist.com.br
    // dão 301 — eram cópias idênticas que diluíam o domínio da empresa.
    const aliasHosts = [
      'ipf-ligths.assist.com.br',
      'ligths.assist.com.br',
      'referee.assist.com.br',
      'referee-ligths.assist.com.br',
      'arbitros.assist.com.br',
      'luzes-ipf.assist.com.br'
    ];
    const hostRedirects = aliasHosts.map((host) => ({
      source: '/:path*',
      has: [{ type: 'host', value: host }],
      destination: 'https://refereelights.app/:path*',
      permanent: true,
      locale: false
    }));
    // No pacote Windows não existe home: a raiz vai direto para o app de
    // criação de salas. Só entra no build do bundle (BUNDLE_TARGET=windows,
    // setado pelo tools/windows/build-package.mjs) — a web não é afetada.
    if (process.env.BUNDLE_TARGET === 'windows') {
      const roots = ['/', '/en-US', '/es-ES'];
      hostRedirects.push(
        ...roots.map((source) => ({
          source,
          destination: '/admin',
          permanent: false,
          locale: false
        }))
      );
    }
    return hostRedirects;
  },
  async headers() {
    // Telas de app fora do índice: robots.txt Disallow sozinho não desindexa
    // (o Bing chegou a listar /admin) — o header noindex exige crawl liberado,
    // por isso os Disallow correspondentes saíram do robots.txt.
    const noindex = ['/admin', '/display', '/legend', '/timer', '/master', '/ref/:path*'];
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

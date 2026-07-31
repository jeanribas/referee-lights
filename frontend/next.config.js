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
    // Consolidação de hostname (2026-07-31): o canônico é luzes-ipf.assist.com.br
    // (declarado no sitemap/robots). Os aliases serviam 5 cópias idênticas do
    // app no domínio assist.com.br — duplicate content que dilui o domínio raiz.
    const aliasHosts = [
      'ipf-ligths.assist.com.br',
      'ligths.assist.com.br',
      'referee.assist.com.br',
      'arbitros.assist.com.br'
    ];
    return aliasHosts.map((host) => ({
      source: '/:path*',
      has: [{ type: 'host', value: host }],
      destination: 'https://luzes-ipf.assist.com.br/:path*',
      permanent: true,
      locale: false
    }));
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

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Embute as dependências nos chunks do servidor em vez de externalizá-las.
  // O runtime do Turbopack resolvia externals por um alias hasheado
  // (`react-qr-code-<hash>`, `@vercel/analytics-<hash>`) que falhava com
  // ERR_MODULE_NOT_FOUND no bundle Windows portátil (v1.3/v1.3.1) — o SSR
  // caía com 500. Com tudo embutido não há resolução em runtime para falhar.
  bundlePagesRouterDependencies: true,
  i18n: {
    locales: ['pt-BR', 'en-US', 'es-ES'],
    defaultLocale: 'pt-BR'
  },
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false
  },
  // Os rewrites do medidor first-party (/_a/* → stats.assist.com.br) vivem no
  // vercel.json, NÃO aqui: com i18n ativo o router do Next não casou a regra
  // em produção nem como afterFiles+locale:false nem como beforeFiles (404,
  // manifest correto — atrito i18n × rewrite externo). No nível da plataforma
  // o proxy acontece antes do Next e funciona como nos demais sites da rede.
  async redirects() {
    // Consolidação de hostname (2026-07-31): o canônico é refereelights.app
    // (domínio próprio do produto). Os subdomínios legados do assist.com.br e o
    // www dão 301 — Bing exige redirect (não só canonical) para host duplicado.
    //
    // statusCode: 301 e NÃO permanent: true (2026-08-11): `permanent` emite 308.
    // A Mudança de Endereço do Search Console tem um teste obrigatório chamado
    // "Redirecionamento 301 da página inicial" e reprovava os hosts com 308.
    // Esta é a única fonte dos redirects de host — não duplicar no vercel.json.
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
      statusCode: 301,
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

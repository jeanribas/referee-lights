/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone existe para o bundle Windows (tools/windows/build-package.mjs
  // copia .next/standalone). Na Vercel ele conflita com o trace do adaptador
  // no Next 16.3 (ENOENT next-server.js.nft.json) — e lá é desnecessário.
  output: process.env.VERCEL ? undefined : 'standalone',
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
  // Consolidação de hostname (2026-07-31): o canônico é refereelights.app. Os
  // redirects dos hosts legados moram no vercel.json, NÃO aqui (mudança de
  // 2026-08-11) — mesma razão dos rewrites acima, o i18n atrapalha:
  //
  //   1. Aqui, `GET /` já chega ao router como `/pt-BR` (o i18n resolve o
  //      locale antes das regras casarem), então `:path*` captura "pt-BR" e o
  //      destino vira refereelights.app/pt-BR em vez da raiz. `locale: false`
  //      não evita isso. A Mudança de Endereço do Search Console quer a home
  //      antiga apontando para a home nova, limpa.
  //   2. `permanent: true` emite 308, e o teste obrigatório do Search Console
  //      ("Redirecionamento 301 da página inicial") é literal quanto ao 301.
  //
  // No vercel.json a regra roda na plataforma, antes do Next: `/` casa a raiz
  // crua e o par `/` + `/:path*` com statusCode 301 entrega o que o GSC pede.
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

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';

type NextRequestHandler = (req: unknown, res: unknown) => Promise<void>;

/**
 * Serve o standalone do Next no MESMO http.Server da API (pacote Windows: uma
 * porta, um processo, um prompt de firewall). As rotas da API resolvem antes;
 * o que sobra (páginas, /_next/*, arquivos de public/) cai no Next pelo
 * handler de "não encontrado". /socket.io/ nem chega aqui: o engine.io trata
 * antes do Fastify.
 *
 * O Next é carregado do node_modules do próprio standalone em tempo de
 * execução (o esbuild não o empacota) com a config gravada no build
 * (.next/required-server-files.json), como faz o server.js do standalone.
 */
export async function attachFrontend(
  app: FastifyInstance,
  frontendDir: string,
  port: number,
  onError: (error: unknown, url: string) => void
): Promise<void> {
  const dir = path.resolve(frontendDir);
  const { config: nextConfig } = JSON.parse(
    readFileSync(path.join(dir, '.next', 'required-server-files.json'), 'utf8')
  ) as { config: Record<string, unknown> };

  // O Next só roda build de produção com NODE_ENV=production, e o standalone
  // espera a config serializada nesta variável.
  (process.env as Record<string, string>).NODE_ENV = 'production';
  process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(nextConfig);

  const requireFromFrontend = createRequire(path.join(dir, 'server.js'));
  const createNext = requireFromFrontend('next') as (options: Record<string, unknown>) => {
    prepare(): Promise<void>;
    getRequestHandler(): NextRequestHandler;
  };
  const nextApp = createNext({
    dev: false,
    dir,
    conf: nextConfig,
    hostname: 'localhost',
    port,
    customServer: true
  });
  await nextApp.prepare();
  const handle = nextApp.getRequestHandler();

  app.setNotFoundHandler((request, reply) => {
    reply.hijack();
    handle(request.raw, reply.raw).catch((error) => {
      onError(error, request.url);
      if (!reply.raw.headersSent) {
        reply.raw.statusCode = 500;
        reply.raw.end('Internal Server Error');
      } else {
        reply.raw.destroy();
      }
    });
  });
}

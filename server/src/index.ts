import { config } from './config.js';
import { initGeo } from './geo.js';
import { createServer } from './server.js';

async function main() {
  const app = await createServer();
  // Não bloqueia o boot: o servidor sobe e o geo entra quando o .mmdb carregar
  void initGeo();
  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
    app.log.info(`Server listening on port ${config.PORT}`);
  } catch (error) {
    app.log.error({ err: error }, 'failed_to_start');
    process.exit(1);
  }
}

main();

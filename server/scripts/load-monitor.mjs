// Pré-carregado (node --import) pelo load-test.mjs no processo da API.
// Imprime métricas internas em stdout, uma linha JSON por amostra:
// memória, atraso do event loop e recursos ativos (timers/sockets).
// Nunca é carregado em produção.
import { monitorEventLoopDelay } from 'node:perf_hooks';

const histogram = monitorEventLoopDelay({ resolution: 10 });
histogram.enable();
const everyMs = Number(process.env.LOAD_MONITOR_MS ?? 5000);

const timer = setInterval(() => {
  const mem = process.memoryUsage();
  const resources = {};
  for (const name of process.getActiveResourcesInfo()) resources[name] = (resources[name] ?? 0) + 1;
  const line = {
    t: Date.now(),
    rssMB: +(mem.rss / 1048576).toFixed(1),
    heapUsedMB: +(mem.heapUsed / 1048576).toFixed(1),
    lagP50ms: +(histogram.percentile(50) / 1e6).toFixed(2),
    lagP99ms: +(histogram.percentile(99) / 1e6).toFixed(2),
    lagMaxMs: +(histogram.max / 1e6).toFixed(2),
    resources
  };
  histogram.reset();
  process.stdout.write(`__LOADMON__${JSON.stringify(line)}\n`);
}, everyMs);
timer.unref();

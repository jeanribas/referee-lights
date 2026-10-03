// Stub do geoip-lite no pacote Windows (alias do esbuild): rede local não
// precisa de geolocalização e a base real tem ~150MB. Mesma interface
// pública; lookup() devolve null, como faria com IP privado/desconhecido.
module.exports = {
  lookup: () => null,
  pretty: (ip) => String(ip),
  startWatchingDataUpdate: () => {},
  stopWatchingDataUpdate: () => {}
};

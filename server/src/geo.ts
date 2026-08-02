import { config } from './config.js';

export interface GeoInfo {
  country: string;
  region: string;
  city: string;
  lat: number;
  lng: number;
}

const EMPTY: GeoInfo = { country: '', region: '', city: '', lat: 0, lng: 0 };

// Leitor GeoLite2-City (MaxMind via geolite2-redist — redistribuição legal,
// baixa/atualiza o .mmdb sozinho). Substitui o geoip-lite, cujo dataset
// embutido resolvia faixas brasileiras como Ruanda sem coordenadas.
let reader: { get(ip: string): unknown } | null = null;

export async function initGeo(): Promise<void> {
  if (!config.GEO_ENABLED) {
    console.log('[geo] desabilitado via GEO_ENABLED=false (modo offline/bundle)');
    return;
  }
  try {
    const geolite2 = await import('geolite2-redist');
    const maxmind = await import('maxmind');
    reader = await geolite2.open(geolite2.GeoIpDbName.City, (path) =>
      maxmind.open(path)
    );
    console.log('[geo] GeoLite2-City carregado');
  } catch (err) {
    console.error('[geo] falha ao carregar GeoLite2 (seguindo sem geo):', (err as Error).message);
  }
}

export function lookupGeo(ip: string): GeoInfo {
  if (!reader || !ip) return EMPTY;
  try {
    const r = reader.get(ip) as {
      country?: { iso_code?: string };
      subdivisions?: Array<{ iso_code?: string }>;
      city?: { names?: { en?: string } };
      location?: { latitude?: number; longitude?: number };
    } | null;
    if (!r) return EMPTY;
    const lat = r.location?.latitude ?? 0;
    const lng = r.location?.longitude ?? 0;
    // País sem coordenada não é confiável nem mapeável — descarta inteiro
    if (lat === 0 && lng === 0) return EMPTY;
    return {
      country: r.country?.iso_code ?? '',
      region: r.subdivisions?.[0]?.iso_code ?? '',
      city: r.city?.names?.en ?? '',
      lat,
      lng
    };
  } catch {
    return EMPTY;
  }
}

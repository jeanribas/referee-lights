import { config } from './config.js';
import { isDatacenterNetwork } from './datacenter-asn.js';

export interface GeoInfo {
  country: string;
  region: string;
  city: string;
  lat: number;
  lng: number;
}

/** Rede de quem conectou: ASN, nome da organização e se é datacenter/VPN. */
export interface NetworkInfo {
  asn: number;
  org: string;
  datacenter: boolean;
}

const EMPTY: GeoInfo = { country: '', region: '', city: '', lat: 0, lng: 0 };
const NO_NETWORK: NetworkInfo = { asn: 0, org: '', datacenter: false };

// Leitor GeoLite2-City (MaxMind via geolite2-redist — redistribuição legal,
// baixa/atualiza o .mmdb sozinho). Substitui o geoip-lite, cujo dataset
// embutido resolvia faixas brasileiras como Ruanda sem coordenadas.
let reader: { get(ip: string): unknown } | null = null;
// Leitor GeoLite2-ASN (mesmo pacote). Só carrega junto com GEO_ENABLED.
let asnReader: { get(ip: string): unknown } | null = null;

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
    try {
      asnReader = await geolite2.open(geolite2.GeoIpDbName.ASN, (path) =>
        maxmind.open(path)
      );
      console.log('[geo] GeoLite2-ASN carregado');
    } catch (err) {
      console.error('[geo] falha ao carregar GeoLite2-ASN (seguindo sem datacenter):', (err as Error).message);
    }
  } catch (err) {
    console.error('[geo] falha ao carregar GeoLite2 (seguindo sem geo):', (err as Error).message);
  }
}

/** ASN e marcação de datacenter do IP. Sem leitor carregado: ASN 0, não é datacenter. */
export function lookupNetwork(ip: string): NetworkInfo {
  if (!asnReader || !ip) return NO_NETWORK;
  try {
    const r = asnReader.get(ip) as {
      autonomous_system_number?: number;
      autonomous_system_organization?: string;
    } | null;
    if (!r) return NO_NETWORK;
    const asn = r.autonomous_system_number ?? 0;
    const org = r.autonomous_system_organization ?? '';
    return { asn, org, datacenter: isDatacenterNetwork(asn, org) };
  } catch {
    return NO_NETWORK;
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

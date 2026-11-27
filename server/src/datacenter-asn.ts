/**
 * Redes de datacenter (nuvem e hospedagem) e de saída de VPN comercial. IP que
 * sai daqui costuma ser servidor, crawler, scanner ou VPN, não um visitante
 * comum. O nome de exibição é "datacenter/VPN" (o campo da API se chama `is_dc`).
 *
 * Como editar:
 * - ASN (`DATACENTER_ASNS`) é a regra principal. Só ASN de nuvem entra; ASN
 *   residencial (ex.: Amazon Kuiper, OVH Telecom) NÃO entra.
 * - Trecho de nome (`DATACENTER_ORG_PATTERNS`) pega a organização do GeoLite2-ASN
 *   quando o ASN não está na lista. Só nomes de hospedagem inequívocos; nada de
 *   "Amazon", "OVH", "Google" ou "Microsoft" genérico, porque esses nomes também
 *   aparecem em redes residenciais e corporativas.
 * - Cloudflare (AS13335) de propósito FORA da lista: o WARP é gente.
 *
 * Falsos positivos aceitos:
 * - Choopa/Vultr (AS20473), M247 (AS9009) e Datacamp (AS60068) também vendem
 *   saída de VPN comercial; quem usa VPN aparece como datacenter/VPN.
 * - AS8075 (Microsoft) inclui rede corporativa e o Windows 365; esse tráfego
 *   também aparece como datacenter/VPN.
 *
 * Os ASNs marcados com (*) não estavam na lista original da equipe e foram
 * incluídos de memória: conferir antes de confiar no número.
 */
export const DATACENTER_ASNS: ReadonlyArray<{ asn: number; nome: string }> = [
  { asn: 16509, nome: 'Amazon (AWS)' },
  { asn: 14618, nome: 'Amazon (AWS)' },
  { asn: 396982, nome: 'Google Cloud' },
  { asn: 15169, nome: 'Google (inclui Googlebot)' },
  { asn: 8075, nome: 'Microsoft (Azure)' },
  { asn: 24940, nome: 'Hetzner' },
  { asn: 16276, nome: 'OVH' },
  { asn: 14061, nome: 'DigitalOcean' },
  { asn: 63949, nome: 'Linode / Akamai Cloud' },
  { asn: 31898, nome: 'Oracle Cloud' },
  { asn: 45102, nome: 'Alibaba Cloud' },
  { asn: 37963, nome: 'Alibaba Cloud (*)' },
  { asn: 132203, nome: 'Tencent Cloud' },
  { asn: 45090, nome: 'Tencent Cloud (*)' },
  { asn: 20473, nome: 'Vultr / Choopa / Constant Company' },
  { asn: 51167, nome: 'Contabo' },
  { asn: 60781, nome: 'Leaseweb (NL)' },
  { asn: 28753, nome: 'Leaseweb (DE)' },
  { asn: 12876, nome: 'Scaleway / Online SAS' },
  { asn: 9009, nome: 'M247' },
  { asn: 32934, nome: 'Meta (Facebook)' },
  { asn: 47583, nome: 'Hostinger' },
  { asn: 8560, nome: 'IONOS (*)' },
  { asn: 40676, nome: 'Psychz Networks (*)' },
  { asn: 60068, nome: 'Datacamp / CDN77 (*)' },
  { asn: 21859, nome: 'Zenlayer (*)' }
];

/** Trechos de nome de organização (case-insensitive), só de hospedagem. */
export const DATACENTER_ORG_PATTERNS: ReadonlyArray<RegExp> = [
  /HETZNER/i,
  /DIGITALOCEAN/i,
  /LINODE/i,
  /\bVULTR\b|CHOOPA|CONSTANT COMPANY/i,
  /CONTABO/i,
  /LEASEWEB/i,
  /SCALEWAY/i,
  /\bM247\b/i,
  /HOSTINGER/i,
  /\bIONOS\b/i,
  /CHERRY SERVERS|CHERRY-SERVERS/i,
  /PSYCHZ/i,
  /DATACAMP/i,
  /ZENLAYER/i
];

const DATACENTER_ASN_SET: ReadonlySet<number> = new Set(DATACENTER_ASNS.map((entry) => entry.asn));

/** Indica se a rede (ASN + nome da organização) é de datacenter. */
export function isDatacenterNetwork(asn: number, org: string): boolean {
  if (asn > 0 && DATACENTER_ASN_SET.has(asn)) return true;
  return DATACENTER_ORG_PATTERNS.some((pattern) => pattern.test(org));
}

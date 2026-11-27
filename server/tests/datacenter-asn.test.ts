// Classificação de datacenter (bot) pela rede: ASN de nuvem marca; gente
// (Cloudflare WARP, Google Fiber, operadoras) não.
import { describe, expect, it } from 'vitest';

import { DATACENTER_ASNS, isDatacenterNetwork } from '../src/datacenter-asn.js';

describe('isDatacenterNetwork', () => {
  it('marca ASN de nuvem e hospedagem', () => {
    expect(isDatacenterNetwork(16509, 'AMAZON-02')).toBe(true);
    expect(isDatacenterNetwork(15169, 'GOOGLE')).toBe(true);
    expect(isDatacenterNetwork(396982, 'GOOGLE-CLOUD-PLATFORM')).toBe(true);
    expect(isDatacenterNetwork(8075, 'MICROSOFT-CORP-MSN-AS-BLOCK')).toBe(true);
    expect(isDatacenterNetwork(24940, 'HETZNER-AS')).toBe(true);
    expect(isDatacenterNetwork(32934, 'FACEBOOK')).toBe(true);
  });

  it('marca pelo nome da organização quando o ASN não está na lista', () => {
    expect(isDatacenterNetwork(99999, 'HETZNER ONLINE GMBH')).toBe(true);
    expect(isDatacenterNetwork(99999, 'DigitalOcean, LLC')).toBe(true);
  });

  it('não marca Cloudflare nem redes de gente', () => {
    expect(isDatacenterNetwork(13335, 'CLOUDFLARENET')).toBe(false);
    expect(isDatacenterNetwork(16591, 'GOOGLE-FIBER')).toBe(false);
    expect(isDatacenterNetwork(7922, 'COMCAST-7922')).toBe(false);
    expect(isDatacenterNetwork(8167, 'Claro S.A.')).toBe(false);
  });

  it('nome genérico de operadora residencial não marca (só ASN de nuvem)', () => {
    expect(isDatacenterNetwork(0, 'AMAZON-AES')).toBe(false);
    expect(isDatacenterNetwork(0, 'Amazon Kuiper residential')).toBe(false);
    expect(isDatacenterNetwork(0, 'OVH Telecom')).toBe(false);
    expect(isDatacenterNetwork(0, 'OVH SAS')).toBe(false);
  });

  it('sem rede conhecida (ASN 0, sem nome) não é datacenter', () => {
    expect(isDatacenterNetwork(0, '')).toBe(false);
  });

  it('lista de ASN sem duplicatas', () => {
    const asns = DATACENTER_ASNS.map((entry) => entry.asn);
    expect(new Set(asns).size).toBe(asns.length);
  });
});

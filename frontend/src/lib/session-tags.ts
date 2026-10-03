/**
 * Tags de sessão por sala/tela.
 * Só `set` (nunca `identify`: sessões continuam por dispositivo). Nunca
 * lança: sem o script (bloqueado, offline, ainda carregando) vira no-op.
 */
type TagFn = (...args: unknown[]) => void;

const PAGE_ROLES = ['admin', 'display', 'legend', 'timer'] as const;

/** Nome da tela: legend/timer registram como display no socket. */
export function pageRole(pathname: string, socketRole: string): string {
  const parts = pathname.split('/').filter(Boolean);
  // Prefixo de locale (/en-US/display) não conta
  const segs = parts[0] && /^[a-z]{2}-[A-Z]{2}$/.test(parts[0]) ? parts.slice(1) : parts;
  if (segs[0] === 'ref' && segs[1]) return segs[1];
  const found = PAGE_ROLES.find((r) => r === segs[0]);
  return found ?? socketRole;
}

export function tagSession(roomId: string, socketRole: string): void {
  try {
    if (typeof window === 'undefined') return;
    const clarity = (window as unknown as { clarity?: TagFn }).clarity;
    if (typeof clarity !== 'function') return;
    clarity('set', 'room', roomId);
    clarity('set', 'role', pageRole(window.location.pathname, socketRole));
    clarity('set', 'target', process.env.NEXT_PUBLIC_BUNDLE_TARGET === 'windows' ? 'bundle' : 'web');
  } catch {
    // tags nunca podem quebrar a tela
  }
}

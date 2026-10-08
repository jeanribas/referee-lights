/**
 * next/router para as telas universais (pacote ES5 sem o runtime do Next):
 * a URL é lida direto do navegador; trocar de idioma recarrega a página no
 * prefixo certo, como o Next faria.
 */
type CompatWindow = { RL: { data: { locale: string; locales: string[]; defaultLocale: string } } };
const rlData = () => (window as unknown as CompatWindow).RL.data;

function parseQuery(search: string) {
  const out: Record<string, string> = {};
  search
    .replace(/^\?/, '')
    .split('&')
    .forEach((pair) => {
      if (!pair) return;
      const i = pair.indexOf('=');
      const k = decodeURIComponent((i < 0 ? pair : pair.slice(0, i)).replace(/\+/g, ' '));
      const v = i < 0 ? '' : decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' '));
      out[k] = v;
    });
  return out;
}

function stripLocale(path: string, locales: string[]) {
  for (const l of locales) {
    if (path === `/${l}`) return '/';
    if (path.indexOf(`/${l}/`) === 0) return path.slice(l.length + 1);
  }
  return path;
}

export function localizedPath(path: string, locale: string) {
  const data = rlData();
  const clean = stripLocale(path, data.locales);
  if (locale === data.defaultLocale) return clean;
  return `/${locale}${clean === '/' ? '' : clean}`;
}

type UrlLike = string | { pathname?: string; query?: Record<string, string | string[] | undefined> };

function toHref(url: UrlLike) {
  if (typeof url === 'string') return url;
  const pathname = url.pathname ?? window.location.pathname;
  const q = url.query ?? {};
  const parts: string[] = [];
  Object.keys(q).forEach((k) => {
    const v = q[k];
    if (v == null) return;
    (Array.isArray(v) ? v : [v]).forEach((item) => parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(item)}`));
  });
  return pathname + (parts.length ? `?${parts.join('&')}` : '');
}

function navigate(url: UrlLike, opts: { locale?: string } | undefined, replace: boolean) {
  let href = toHref(url);
  const data = rlData();
  const locale = opts?.locale ?? data.locale;
  const qi = href.indexOf('?');
  const path = qi < 0 ? href : href.slice(0, qi);
  href = localizedPath(path, locale) + (qi < 0 ? '' : href.slice(qi));
  if (opts?.locale) document.cookie = `NEXT_LOCALE=${opts.locale}; path=/; max-age=31536000`;
  if (replace) window.location.replace(href);
  else window.location.href = href;
  return Promise.resolve(true);
}

const noop = () => {};

export function useRouter() {
  const data = rlData();
  return {
    locale: data.locale,
    locales: data.locales,
    defaultLocale: data.defaultLocale,
    pathname: stripLocale(window.location.pathname, data.locales),
    asPath: stripLocale(window.location.pathname, data.locales) + window.location.search,
    query: parseQuery(window.location.search),
    isReady: true,
    replace: (url: UrlLike, _as?: unknown, opts?: { locale?: string }) => navigate(url, opts, true),
    push: (url: UrlLike, _as?: unknown, opts?: { locale?: string }) => navigate(url, opts, false),
    events: { on: noop, off: noop, emit: noop }
  };
}

const router = { useRouter };
export default router;

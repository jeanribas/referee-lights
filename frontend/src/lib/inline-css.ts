/**
 * Só no pacote (BUNDLE_TARGET=windows): copia o conteúdo de cada
 * <link rel="stylesheet"> do mesmo host para um <style data-inline-css> logo
 * depois dele. O link continua no lugar (mesma cascata, nenhuma mudança
 * visual); o <style> garante que o CSS esteja DENTRO do DOM, para ferramentas
 * que reconstroem a página fora da rede local (as URLs do pacote são IPs de
 * LAN, inalcançáveis de fora).
 */
const DONE_ATTR = 'data-inline-css-done';

function absolutizeUrls(css: string, baseHref: string): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (match, quote: string, ref: string) => {
    if (/^(data:|https?:|\/|#)/i.test(ref)) return match;
    try {
      const abs = new URL(ref, baseHref);
      return `url(${quote}${abs.pathname}${abs.search}${abs.hash}${quote})`;
    } catch {
      return match;
    }
  });
}

async function inlineLink(link: HTMLLinkElement): Promise<void> {
  if (link.hasAttribute(DONE_ATTR)) return;
  link.setAttribute(DONE_ATTR, '');
  let url: URL;
  try {
    url = new URL(link.href, window.location.href);
  } catch {
    return;
  }
  if (url.origin !== window.location.origin) return;
  try {
    const res = await fetch(url.href, { credentials: 'same-origin' });
    if (!res.ok) return;
    const css = await res.text();
    const style = document.createElement('style');
    style.setAttribute('data-inline-css', url.pathname);
    if (link.media) style.media = link.media;
    style.textContent = absolutizeUrls(css, url.href);
    link.after(style);
  } catch {
    // Sem rede/arquivo: o <link> original continua estilizando a página.
  }
}

/** Inline de todos os stylesheets atuais; observa os que entrarem depois. */
export function inlineSameOriginStylesheets(): Promise<void> {
  const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'));
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (node instanceof HTMLLinkElement && node.rel === 'stylesheet') void inlineLink(node);
      });
    }
  });
  observer.observe(document.head, { childList: true });
  return Promise.all(links.map(inlineLink)).then(() => undefined);
}

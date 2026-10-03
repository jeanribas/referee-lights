import type { AppProps } from 'next/app';
import Head from 'next/head';
import Script from 'next/script';
import { useEffect } from 'react';
import { Analytics } from '@vercel/analytics/react';

import { Seo } from '@/components/Seo';
import { inlineSameOriginStylesheets } from '@/lib/inline-css';

import '@/styles/globals.css';

const IS_BUNDLE = process.env.NEXT_PUBLIC_BUNDLE_TARGET === 'windows';
const SESSION_SNIPPET = `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script","w1gy8xnf5m");`;

/**
 * No pacote o CSS é copiado para <style> no DOM (estilos dentro da página)
 * antes dos scripts externos: as URLs dos .css são IPs de LAN. Na web nada muda.
 */
function useBundleInlineCss() {
  useEffect(() => {
    if (!IS_BUNDLE) return;
    let cancelled = false;
    inlineSameOriginStylesheets().finally(() => {
      if (cancelled || document.getElementById('microsoft-clarity')) return;
      const s = document.createElement('script');
      s.id = 'microsoft-clarity';
      s.text = SESSION_SNIPPET;
      document.body.appendChild(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);
}

export default function App({ Component, pageProps }: AppProps) {
  useBundleInlineCss();
  return (
    <>
      <Head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/images/icon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="apple-touch-icon" href="/images/icon-192.png" />
      </Head>
      <Seo />
      <Component {...pageProps} />
      <Analytics />
      {!IS_BUNDLE && (
        <Script id="microsoft-clarity" strategy="afterInteractive">
          {SESSION_SNIPPET}
        </Script>
      )}
    </>
  );
}

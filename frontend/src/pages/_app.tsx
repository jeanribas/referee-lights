import { useEffect } from 'react';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import Script from 'next/script';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';

import { Seo } from '@/components/Seo';
import { trackPageView } from '@/lib/api';

import '@/styles/globals.css';

/**
 * Analytics de terceiros (Vercel + Clarity) ficam FORA do bundle Windows.
 *
 * Dois motivos, os dois aprendidos do jeito difícil:
 * - o import estático de @vercel/analytics fazia o Turbopack externalizar o
 *   módulo no build do servidor com um nome hasheado
 *   (`@vercel/analytics-<hash>`) que só resolve dentro do ambiente de build —
 *   no bundle portátil o SSR quebrava em toda requisição (v1.3);
 * - numa competição em LAN sem internet esses scripts não coletam nada, só
 *   tentam sair da rede do ginásio.
 *
 * `next/dynamic` com ssr:false tira o módulo do chunk do servidor; a flag
 * NEXT_PUBLIC_OFFLINE_BUNDLE (definida pelo empacotador) tira dos clientes.
 */
const IS_OFFLINE_BUNDLE = process.env.NEXT_PUBLIC_OFFLINE_BUNDLE === '1';

const VercelAnalytics = dynamic(
  () => import('@vercel/analytics/react').then((m) => m.Analytics),
  { ssr: false }
);

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;
    trackPageView(window.location.pathname, { locale: router.locale, includeReferrer: true });
    // roda uma vez por carga inicial; navegações client-side vêm do listener abaixo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  useEffect(() => {
    const onRouteDone = (url: string) => trackPageView(url, { locale: router.locale });
    router.events.on('routeChangeComplete', onRouteDone);
    return () => router.events.off('routeChangeComplete', onRouteDone);
  }, [router.events, router.locale]);

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
      {!IS_OFFLINE_BUNDLE && <VercelAnalytics />}
      {!IS_OFFLINE_BUNDLE && (
        <Script id="microsoft-clarity" strategy="afterInteractive">
          {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script","w1gy8xnf5m");`}
        </Script>
      )}
    </>
  );
}

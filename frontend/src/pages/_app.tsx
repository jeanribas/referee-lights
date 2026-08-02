import { useEffect } from 'react';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import Script from 'next/script';
import { useRouter } from 'next/router';
import { Analytics } from '@vercel/analytics/react';

import { Seo } from '@/components/Seo';
import { trackPageView } from '@/lib/api';

import '@/styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;
    trackPageView(window.location.pathname);
    // roda uma vez por carga inicial; navegações client-side vêm do listener abaixo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  useEffect(() => {
    const onRouteDone = (url: string) => trackPageView(url);
    router.events.on('routeChangeComplete', onRouteDone);
    return () => router.events.off('routeChangeComplete', onRouteDone);
  }, [router.events]);

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
      <Script id="microsoft-clarity" strategy="afterInteractive">
        {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script","w1gy8xnf5m");`}
      </Script>
    </>
  );
}

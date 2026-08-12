import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/router';

import { FooterBadges } from '@/components/FooterBadges';
import { getMessages } from '@/lib/i18n/messages';
import { APP_LOCALES, type AppLocale } from '@/lib/i18n/config';
import { Seo } from '@/components/Seo';
import { useEffect, useState } from 'react';

function LanguageSelector() {
  const router = useRouter();
  const current = (router.locale ?? 'pt-BR') as AppLocale;
  const messages = getMessages(current);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const check = () => setCompact(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return (
    <div style={{ display: 'flex', gap: compact ? 2 : 4, background: '#0f172a', borderRadius: 8, padding: 2 }}>
      {APP_LOCALES.map((loc) => (
        <button
          key={loc}
          onClick={() => {
            // Ver comentário em index.tsx: sem o cookie a escolha não persiste.
            document.cookie = `NEXT_LOCALE=${loc}; path=/; max-age=31536000`;
            void router.push(router.asPath, undefined, { locale: loc });
          }}
          style={{
            padding: compact ? '4px 8px' : '4px 10px',
            border: 'none',
            background: loc === current ? '#1C64F2' : 'transparent',
            color: loc === current ? '#fff' : '#94a3b8',
            cursor: 'pointer',
            borderRadius: 6,
            fontSize: compact ? '0.7rem' : '0.8rem',
            fontWeight: 600,
          }}
        >
          {compact ? loc.split('-')[0].toUpperCase() : messages.common.languages[loc]}
        </button>
      ))}
    </div>
  );
}

export default function WindowsPage() {
  const router = useRouter();
  const locale = (router.locale ?? 'pt-BR') as AppLocale;
  const messages = getMessages(locale);
  const t = messages.windows;

  return (
    <>
      <Seo
        title={`Referee Lights · ${t.metaTitle}`}
        description={t.metaDescription}
        canonicalPath="/windows"
      />
      <Head>
        <meta key="keywords" name="keywords" content="referee lights windows, download referee lights, powerlifting software windows, luzes arbitragem windows, install referee lights, portable referee lights, IPF powerlifting software" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'HowTo',
              name: t.title,
              description: t.metaDescription,
              totalTime: 'PT5M',
              tool: { '@type': 'HowToTool', name: 'Windows 10+ (64-bit)' },
              step: t.steps.map((step, i) => ({
                '@type': 'HowToStep',
                position: i + 1,
                name: step.title,
                text: step.desc,
              })),
            }),
          }}
        />
      </Head>

      <div
        style={{
          minHeight: '100vh',
          background: '#020617',
          color: '#f1f5f9',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        }}
      >
        {/* Nav — same structure as home */}
        <nav
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 100,
            background: 'rgba(2,6,23,0.85)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid #1e293b',
            padding: '0 12px',
          }}
        >
          <div
            style={{
              maxWidth: 1000,
              margin: '0 auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              height: 56,
              gap: 8,
            }}
          >
            <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, textDecoration: 'none' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ display: 'flex', gap: 5 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 4, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  </div>
                  <div style={{ width: 28, height: 28, borderRadius: 4, background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round"><line x1="18" x2="6" y1="6" y2="18" /><line x1="6" x2="18" y1="6" y2="18" /></svg>
                  </div>
                  <div style={{ width: 28, height: 28, borderRadius: 4, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'baseline', fontFamily: "'Inter', sans-serif", letterSpacing: '-0.02em', textTransform: 'uppercase' as const, fontSize: '0.7rem', lineHeight: 1 }}>
                  <span style={{ fontWeight: 700, color: '#fff' }}>Referee</span>
                  <span style={{ fontWeight: 900, color: '#ef4444' }}>Lights</span>
                </div>
              </div>
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 }}>
              <LanguageSelector />
              <a
                href="https://github.com/jeanribas/referee-lights/releases"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: 'linear-gradient(to right, #0ea5e9, #6366f1, #3b82f6)',
                  color: '#fff',
                  padding: '6px 14px',
                  borderRadius: 16,
                  textDecoration: 'none',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {t.cta}
              </a>
            </div>
          </div>
        </nav>

        {/* Back link */}
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '12px 24px 0' }}>
          <Link href="/" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: '0.8rem' }}>
            &larr; {t.backHome}
          </Link>
        </div>

        {/* Header */}
        <section style={{ padding: '40px 24px 40px', textAlign: 'center' }}>
          <div style={{ maxWidth: 700, margin: '0 auto' }}>
            {/* Windows icon */}
            <div style={{ fontSize: '3rem', marginBottom: 16 }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="#0ea5e9" style={{ display: 'inline-block' }}>
                <path d="M3 12V6.75l8-1.25V12H3zm0 .5h8v6.5l-8-1.25V12.5zm9-7L22 4v8.5H12V5.5zm0 7.5h10V20l-10-1.5V13z" />
              </svg>
            </div>
            <h1 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', fontWeight: 800, marginBottom: 12 }}>
              {t.title}
            </h1>
            <p style={{ color: '#94a3b8', fontSize: '1.05rem', maxWidth: 500, margin: '0 auto' }}>
              {t.subtitle}
            </p>
          </div>
        </section>

        {/* Steps */}
        <section style={{ padding: '0 24px 48px' }}>
          <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {t.steps.map((step, i) => (
              <div
                key={i}
                style={{
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: 12,
                  padding: '24px 24px',
                  display: 'flex',
                  gap: 16,
                  alignItems: 'flex-start',
                }}
              >
                <div
                  style={{
                    minWidth: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '1rem',
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </div>
                <div>
                  <div style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 4 }}>
                    {step.title}
                  </div>
                  <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: 0, lineHeight: 1.6 }}>
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Requirements */}
        <section style={{ padding: '48px 24px', background: '#0a0f1a' }}>
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 20 }}>
              {t.requirements.title}
            </h2>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {t.requirements.items.map((item, i) => (
                <li
                  key={i}
                  style={{
                    display: 'flex',
                    gap: 12,
                    alignItems: 'flex-start',
                    color: '#cbd5e1',
                    fontSize: '0.9rem',
                  }}
                >
                  <span style={{ color: '#22c55e', fontWeight: 700, fontSize: '1rem', flexShrink: 0 }}>&#10003;</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Troubleshooting */}
        <section style={{ padding: '48px 24px' }}>
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 20 }}>
              {t.troubleshooting.title}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {t.troubleshooting.items.map((item, i) => (
                <div
                  key={i}
                  style={{
                    background: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: 12,
                    padding: 20,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.95rem' }}>
                    {item.q}
                  </div>
                  <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0, lineHeight: 1.6 }}>
                    {item.a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section style={{ padding: '48px 24px 64px', textAlign: 'center' }}>
          <a
            href="https://github.com/jeanribas/referee-lights/releases"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: 'linear-gradient(to right, #0ea5e9, #6366f1, #3b82f6)',
              color: '#fff',
              padding: '14px 32px',
              borderRadius: 16,
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '1rem',
              display: 'inline-block',
            }}
          >
            {t.cta}
          </a>
        </section>

        {/* Footer */}
        <footer style={{ borderTop: '1px solid #1e293b', padding: 24, textAlign: 'center' }}>
          <FooterBadges alwaysVisible />
        </footer>
      </div>
    </>
  );
}

import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/router';

import { useEffect, useState } from 'react';
import { FooterBadges } from '@/components/FooterBadges';
import { FaqList } from '@/components/FaqList';
import { getMessages } from '@/lib/i18n/messages';
import { APP_LOCALES, type AppLocale } from '@/lib/i18n/config';
import { Seo } from '@/components/Seo';

/* ------------------------------------------------------------------ */
/*  Step card                                                          */
/* ------------------------------------------------------------------ */
function StepCard({
  number,
  title,
  description,
}: {
  number: number;
  title: string;
  description: string;
  icon: string;
}) {
  return (
    <div
      style={{
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: 12,
        padding: '28px 24px',
        display: 'flex',
        gap: 16,
        alignItems: 'flex-start',
      }}
    >
      <div
        style={{
          minWidth: 44,
          height: 44,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: '1.1rem',
          flexShrink: 0,
        }}
      >
        {number}
      </div>
      <div>
        <div style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: 4 }}>
          {title}
        </div>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: 0, lineHeight: 1.6 }}>
          {description}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Screen link card                                                   */
/* ------------------------------------------------------------------ */
function ScreenLink({
  path,
  title,
  description,
}: {
  path: string;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <div
      style={{
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: 12,
        padding: '20px 24px',
        color: '#f1f5f9',
        display: 'block',
        minHeight: 120,
        transition: 'border-color 0.2s, transform 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#ef4444';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#1e293b';
        e.currentTarget.style.transform = 'none';
      }}
    >
      <div
        style={{
          fontFamily: "'SF Mono', 'Fira Code', monospace",
          fontSize: '0.8rem',
          color: '#ef4444',
          marginBottom: 4,
        }}
      >
        {path}
      </div>
      <div style={{ fontWeight: 600, marginBottom: 2 }}>{title}</div>
      <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: 0 }}>{description}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Language selector                                                  */
/* ------------------------------------------------------------------ */
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
          onClick={() => router.push(router.asPath, undefined, { locale: loc })}
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

/* ------------------------------------------------------------------ */
/*  Home page                                                          */
/* ------------------------------------------------------------------ */
export default function HomePage() {
  const router = useRouter();
  const locale = (router.locale ?? 'pt-BR') as AppLocale;
  const messages = getMessages(locale);
  const t = messages.home;

  // Scroll animation observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('ss-visible');
          }
        });
      },
      { threshold: 0.15 }
    );
    document.querySelectorAll('.ss-card').forEach((el) => observer.observe(el));

    // Fade-in on scroll for all sections
    const fadeObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('fade-in-visible');
          }
        });
      },
      { threshold: 0, rootMargin: '0px 0px 50px 0px' }
    );
    document.querySelectorAll('.fade-in').forEach((el) => fadeObserver.observe(el));

    // Fallback: reveal any fade-in elements already in viewport on load
    requestAnimationFrame(() => {
      document.querySelectorAll('.fade-in').forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight + 50) {
          el.classList.add('fade-in-visible');
        }
      });
    });

    // Smooth parallax on scroll using transform
    const showcase = document.querySelector('.ss-showcase') as HTMLElement | null;
    const cards = showcase?.querySelectorAll<HTMLElement>('.ss-card');
    const speeds = [0.08, -0.04, 0.05, -0.06];
    let rafId = 0;
    let lastScroll = -1;

    const updateParallax = () => {
      if (!showcase || !cards) return;
      const rect = showcase.getBoundingClientRect();
      const progress = -rect.top / window.innerHeight;

      cards.forEach((card, i) => {
        const speed = speeds[i % speeds.length];
        const y = progress * speed * 200;
        card.style.setProperty('--parallax-y', `${y}px`);
      });
    };

    const onScroll = () => {
      if (lastScroll === window.scrollY) return;
      lastScroll = window.scrollY;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateParallax);
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      observer.disconnect();
      fadeObserver.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, [locale]);

  return (
    <>
      <Seo
        title={`Referee Lights · ${t.metaTitle}`}
        description={t.metaDescription}
        canonicalPath="/"
      />
      <Head>
        <meta key="keywords" name="keywords" content="referee lights, powerlifting, IPF, referee light system, luzes de arbitragem, sistema de arbitragem, luces de arbitraje, jueces powerlifting, competition management, real-time, open source, PWA, chroma key, OBS, streaming, QR code, penalty cards, cartões IPF, tarjetas IPF, cronômetro, timer, good lift, no lift" />
        <meta key="robots" name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'Referee Lights',
              applicationCategory: 'SportsApplication',
              operatingSystem: 'Web, Windows, Docker',
              offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
              description: t.metaDescription,
              softwareVersion: '1.2',
              author: { '@type': 'Person', name: 'Jean Ribas' },
              url: 'https://github.com/jeanribas/referee-lights',
              downloadUrl: 'https://github.com/jeanribas/referee-lights/releases',
              screenshot: [
                'https://refereelights.app/screenshots/display.jpg',
                'https://refereelights.app/screenshots/admin.jpg',
                'https://refereelights.app/screenshots/display-2.jpg',
                'https://refereelights.app/screenshots/cromakey.jpg',
              ],
              featureList: [
                'Real-time referee light synchronization',
                'IPF penalty cards (yellow, red, red+yellow)',
                'Competition timer and interval management',
                'Chroma key overlay for broadcasting',
                'QR code referee access',
                'Progressive Web App (PWA)',
                'Multi-language support (PT, EN, ES)',
                'Windows portable package',
                'Docker deployment',
              ],
              inLanguage: ['pt-BR', 'en-US', 'es-ES'],
            }),
          }}
        />
      </Head>

      <div
        style={{
          minHeight: '100vh',
          background: '#020617',
          color: '#f1f5f9',
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        }}
      >
        {/* ── Nav ── */}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <a href="#" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0, textDecoration: 'none' }}>
                {/* 3 lights */}
                <div style={{ display: 'flex', gap: 5 }}>
                  {/* White check */}
                  <div style={{ width: 28, height: 28, borderRadius: 4, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  </div>
                  {/* Red X */}
                  <div style={{ width: 28, height: 28, borderRadius: 4, background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round"><line x1="18" x2="6" y1="6" y2="18" /><line x1="6" x2="18" y1="6" y2="18" /></svg>
                  </div>
                  {/* White check */}
                  <div style={{ width: 28, height: 28, borderRadius: 4, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  </div>
                </div>
                {/* Text */}
                <div style={{ display: 'flex', gap: 4, alignItems: 'baseline', fontFamily: "'Inter', sans-serif", letterSpacing: '-0.02em', textTransform: 'uppercase' as const, fontSize: '0.7rem', lineHeight: 1 }}>
                  <span style={{ fontWeight: 700, color: '#fff' }}>Referee</span>
                  <span style={{ fontWeight: 900, color: '#ef4444' }}>Lights</span>
                </div>
              </a>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 }}>
              <LanguageSelector />
              <Link
                href="/admin"
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
                {t.ctaAdmin}
              </Link>
            </div>
          </div>
        </nav>

        {/* ── Hero ── */}
        <section
          style={{
            textAlign: 'center',
            padding: '80px 24px 60px',
            background:
              'radial-gradient(ellipse at 50% 0%, rgba(239,68,68,0.12) 0%, transparent 60%)',
          }}
        >
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: 999,
                padding: '6px 16px',
                fontSize: '0.8rem',
                color: '#94a3b8',
                marginBottom: 24,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#22c55e',
                  display: 'inline-block',
                }}
              />
              {t.heroBadge}
            </div>
            <h1
              style={{
                fontSize: 'clamp(2rem, 5vw, 3rem)',
                fontWeight: 800,
                lineHeight: 1.15,
                marginBottom: 16,
                letterSpacing: '-0.02em',
              }}
            >
              {t.heroTitle}
            </h1>
            <p style={{ fontSize: '1.1rem', color: '#94a3b8', maxWidth: 560, margin: '0 auto 32px' }}>
              {t.heroDesc}
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link
                href="/admin"
                style={{
                  background: 'linear-gradient(to right, #0ea5e9, #6366f1, #3b82f6)',
                  color: '#fff',
                  padding: '14px 28px',
                  borderRadius: 16,
                  textDecoration: 'none',
                  fontWeight: 600,
                  fontSize: '1rem',
                }}
              >
                {t.heroCtaPrimary}
              </Link>
              <a
                href="#how-it-works"
                style={{
                  background: '#0f172a',
                  color: '#f1f5f9',
                  padding: '14px 28px',
                  borderRadius: 10,
                  textDecoration: 'none',
                  fontWeight: 600,
                  fontSize: '1rem',
                  border: '1px solid #1e293b',
                }}
              >
                {t.heroCtaSecondary}
              </a>
            </div>
            <div style={{ marginTop: 16 }}>
              <Link
                href="/windows"
                style={{
                  color: '#94a3b8',
                  fontSize: '0.85rem',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#94a3b8"><path d="M3 12V6.75l8-1.25V12H3zm0 .5h8v6.5l-8-1.25V12.5zm9-7L22 4v8.5H12V5.5zm0 7.5h10V20l-10-1.5V13z" /></svg>
                {messages.windows.metaTitle}
              </Link>
            </div>
          </div>
        </section>

        {/* ── Screenshots showcase ── */}
        <section style={{ padding: '0 24px 80px', overflow: 'hidden' }}>
          <div
            className="ss-showcase"
            style={{ maxWidth: 1000, margin: '0 auto', position: 'relative', height: 'clamp(380px, 55vw, 650px)' }}
          >
            {/* Chroma key (green) — center top, 50% higher than the pair */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/screenshots/cromakey.jpg"
              alt="Chroma Key — OBS Overlay"
              className="ss-card ss-front"
              style={{
                position: 'absolute',
                top: '10%',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '38%',
                borderRadius: 12,
                border: '1px solid rgba(0,0,0,0.4)',
                zIndex: 0,
              }}
            />
            {/* Left — display no lift (dark) — aligned as pair */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/screenshots/display-2.jpg"
              alt="Display — No Lift"
              className="ss-card ss-left"
              style={{
                position: 'absolute',
                top: '22%',
                left: 0,
                width: '38%',
                borderRadius: 14,
                border: '1px solid rgba(0,0,0,0.4)',
                zIndex: 1,
              }}
            />
            {/* Right — admin (dark) — aligned as pair */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/screenshots/admin.jpg"
              alt="Admin Panel"
              className="ss-card ss-right"
              style={{
                position: 'absolute',
                top: '22%',
                right: 0,
                width: '38%',
                borderRadius: 14,
                border: '1px solid rgba(0,0,0,0.4)',
                zIndex: 1,
              }}
            />
            {/* Main — display good lift (2x larger, front, 50% below pair) */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/screenshots/display.jpg"
              alt="Display — Good Lift"
              className="ss-card ss-admin"
              style={{
                position: 'absolute',
                top: '40%',
                left: '50%',
                width: '72%',
                borderRadius: 16,
                border: '1px solid rgba(0,0,0,0.4)',
                zIndex: 3,
              }}
            />
          </div>
        </section>

        {/* ── What is ── */}
        <section style={{ padding: '64px 24px' }}>
          <div className="fade-in" style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
            <h2 style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)', fontWeight: 700, marginBottom: 16 }}>
              {t.whatIsTitle}
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '1rem', lineHeight: 1.7, maxWidth: 640, margin: '0 auto' }}>
              {t.whatIsDesc}
            </p>
          </div>
        </section>

        {/* ── How it works (step by step) ── */}
        <section id="how-it-works" style={{ padding: '64px 24px', background: '#0a0f1a' }}>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <h2 className="fade-in"
              style={{
                fontSize: 'clamp(1.4rem, 3vw, 2rem)',
                fontWeight: 700,
                textAlign: 'center',
                marginBottom: 12,
              }}
            >
              {t.stepsTitle}
            </h2>
            <p
              style={{
                color: '#94a3b8',
                textAlign: 'center',
                marginBottom: 40,
                maxWidth: 480,
                margin: '0 auto 40px',
              }}
            >
              {t.stepsSubtitle}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {t.steps.map((step: { title: string; desc: string; icon: string }, i: number) => (
                <div key={i} className={`fade-in fade-in-d${i + 1}`}>
                  <StepCard
                    number={i + 1}
                    title={step.title}
                    description={step.desc}
                    icon={step.icon}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Screens ── */}
        <section style={{ padding: '64px 24px' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <h2 className="fade-in"
              style={{
                fontSize: 'clamp(1.4rem, 3vw, 2rem)',
                fontWeight: 700,
                textAlign: 'center',
                marginBottom: 12,
              }}
            >
              {t.screensTitle}
            </h2>
            <p
              style={{
                color: '#94a3b8',
                textAlign: 'center',
                marginBottom: 40,
                maxWidth: 480,
                margin: '0 auto 40px',
              }}
            >
              {t.screensSubtitle}
            </p>
            <div
              style={{
                display: 'grid',
                gap: 16,
              }}
              className="grid-3col"
            >
              {t.screens.map((s: { path: string; title: string; desc: string; href: string }) => (
                <ScreenLink key={s.path} path={s.path} title={s.title} description={s.desc} href={s.href} />
              ))}
            </div>
          </div>
        </section>

        {/* ── Features highlights ── */}
        <section style={{ padding: '64px 24px', background: '#0a0f1a' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <h2 className="fade-in"
              style={{
                fontSize: 'clamp(1.4rem, 3vw, 2rem)',
                fontWeight: 700,
                textAlign: 'center',
                marginBottom: 40,
              }}
            >
              {t.featuresTitle}
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: 16,
              }}
            >
              {t.features.map((f: { icon: string; title: string; desc: string }, i: number) => (
                <div
                  key={i}
                  className={`fade-in fade-in-d${Math.min(i + 1, 5)}`}
                  style={{
                    background: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: 12,
                    padding: 24,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{f.title}</div>
                  <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ (resumo — a lista completa vive em /faq) ── */}
        <section id="faq" style={{ padding: '64px 24px' }}>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <h2 className="fade-in"
              style={{
                fontSize: 'clamp(1.4rem, 3vw, 2rem)',
                fontWeight: 700,
                textAlign: 'center',
                marginBottom: 12,
              }}
            >
              {messages.faq.title}
            </h2>
            <p
              style={{
                color: '#94a3b8',
                textAlign: 'center',
                maxWidth: 480,
                margin: '0 auto 40px',
              }}
            >
              {messages.faq.subtitle}
            </p>
            {/* Índices em faq.items: 0 o que é, 1 gratuito, 2 app/conta, 8 competições oficiais */}
            <FaqList items={[0, 1, 2, 8].map((i) => messages.faq.items[i])} />
            <div style={{ textAlign: 'center', marginTop: 28 }}>
              <Link
                href="/faq"
                style={{
                  color: '#cbd5e1',
                  textDecoration: 'none',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  borderBottom: '1px solid #334155',
                  paddingBottom: 2,
                }}
              >
                {messages.faq.seeAll} &rarr;
              </Link>
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section
          style={{
            padding: '80px 24px',
            textAlign: 'center',
            background:
              'radial-gradient(ellipse at 50% 100%, rgba(239,68,68,0.1) 0%, transparent 60%)',
          }}
        >
          <h2 className="fade-in" style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)', fontWeight: 700, marginBottom: 16 }}>
            {t.ctaTitle}
          </h2>
          <p className="fade-in fade-in-d1" style={{ color: '#94a3b8', maxWidth: 480, margin: '0 auto 28px' }}>{t.ctaDesc}</p>
          <Link
            href="/admin"
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
            {t.ctaAdmin}
          </Link>
        </section>

        {/* ── Footer ── */}
        <footer
          style={{
            borderTop: '1px solid #1e293b',
            padding: '24px',
            textAlign: 'center',
          }}
        >
          <FooterBadges alwaysVisible />
        </footer>
      </div>

      <style jsx global>{`
        /* ── Responsive grids ── */
        .grid-3col {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
        }
        @media (max-width: 768px) {
          .grid-3col {
            grid-template-columns: 1fr;
          }
        }

        /* ── Fade-in on scroll ── */
        .fade-in {
          opacity: 0;
          transform: translateY(30px);
          transition: opacity 0.7s ease, transform 0.7s ease;
        }
        .fade-in-visible {
          opacity: 1;
          transform: translateY(0);
        }
        .fade-in-d1 { transition-delay: 0.1s; }
        .fade-in-d2 { transition-delay: 0.2s; }
        .fade-in-d3 { transition-delay: 0.3s; }
        .fade-in-d4 { transition-delay: 0.4s; }
        .fade-in-d5 { transition-delay: 0.5s; }

        /* ── Screenshot cards: initial state (hidden) ── */
        .ss-card {
          --parallax-y: 0px;
          opacity: 0;
          will-change: transform;
          transition: opacity 0.8s cubic-bezier(0.22, 1, 0.36, 1),
                      transform 0.8s cubic-bezier(0.22, 1, 0.36, 1),
                      box-shadow 0.4s ease;
        }

        /* Per-card starting positions */
        .ss-admin  { transform: translateX(-50%) translateY(40px) scale(0.95); }
        .ss-front  { transform: translateX(-50%) translateY(-40px) scale(0.9); }
        .ss-left   { transform: translateX(-60px) translateY(50px) scale(0.92); }
        .ss-right  { transform: translateX(60px) translateY(50px) scale(0.92); }

        /* Visible state — slide into place */
        .ss-admin.ss-visible {
          opacity: 1;
          transform: translateX(-50%) translateY(var(--parallax-y)) scale(1);
          box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6),
                      0 0 40px rgba(99, 102, 241, 0.08);
        }
        .ss-front.ss-visible {
          opacity: 1;
          transform: translateX(-50%) translateY(var(--parallax-y)) scale(1);
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5),
                      0 0 40px rgba(34, 197, 94, 0.15);
          transition-delay: 0.1s;
        }
        .ss-left.ss-visible {
          opacity: 1;
          transform: translateY(var(--parallax-y)) scale(1);
          box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5),
                      0 0 30px rgba(239, 68, 68, 0.08);
          transition-delay: 0.3s;
        }
        .ss-right.ss-visible {
          opacity: 1;
          transform: translateY(var(--parallax-y)) scale(1);
          box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5),
                      0 0 30px rgba(34, 197, 94, 0.1);
          transition-delay: 0.45s;
        }

        /* Hover glow */
        .ss-card:hover {
          box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6),
                      0 0 40px rgba(99, 102, 241, 0.1) !important;
          z-index: 10 !important;
          transition: transform 0.5s ease,
                      box-shadow 0.5s ease !important;
        }
        .ss-left:hover, .ss-right:hover {
          transform: translateY(var(--parallax-y)) scale(1.01) !important;
        }
        .ss-admin:hover { transform: translateX(-50%) translateY(var(--parallax-y)) scale(1.01) !important; }
        .ss-front:hover { transform: translateX(-50%) translateY(var(--parallax-y)) scale(1.01) !important; }
      `}</style>
    </>
  );
}

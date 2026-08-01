import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getMessages } from '@/lib/i18n/messages';
import { trackLinkClick } from '@/lib/api';

export function FooterBadges({ alwaysVisible = false }: { alwaysVisible?: boolean }) {
  const router = useRouter();
  const locale = typeof router.locale === 'string' ? router.locale : undefined;
  const footer = useMemo(() => getMessages(locale).admin.footer, [locale]);
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (alwaysVisible) return;
    const onScroll = () => {
      setVisible(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setVisible(true), 1500);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [alwaysVisible]);

  const handleClick = (url: string) => () => { void trackLinkClick(url); };

  return (
    <div
      className="flex w-full flex-col items-center gap-1.5 py-3 text-center transition-opacity duration-300"
      style={{ opacity: visible ? undefined : 0, pointerEvents: visible ? undefined : 'none' }}
    >
      <a
        href="https://github.com/jeanribas/referee-lights"
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick('https://github.com/jeanribas/referee-lights')}
        className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-slate-400 transition hover:text-slate-200"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="shrink-0">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
        {footer.openSource}
      </a>
      <a
        href="https://assist.com.br"
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick('https://assist.com.br')}
        className="text-[10px] tracking-widest text-slate-400 transition hover:text-slate-200"
      >
{footer.hostedBy} <span className="font-semibold">{footer.hostedByName}</span>
      </a>
    </div>
  );
}

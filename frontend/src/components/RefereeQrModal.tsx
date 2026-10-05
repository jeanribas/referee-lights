import { useEffect, useState, type MouseEvent } from 'react';
import QRCode from 'react-qr-code';

import type { Messages } from '@/lib/i18n/messages';
import type { QrTarget } from '@/lib/ref-links';
import type { Judge } from '@/types/state';

/**
 * QR codes dos três árbitros da sessão. No admin vem com "Gerar novos links"
 * (`onRefreshTokens`); no timer e no display só MOSTRA os links atuais — quem
 * perdeu a página escaneia de novo sem derrubar ninguém.
 *
 * Tela estreita (timer em pé): um QR por vez, escolhido nos três botões.
 * Tela larga: os três lado a lado.
 */
export function RefereeQrModal({
  targets,
  loading,
  onClose,
  messages,
  closeLabel,
  description,
  notice,
  onRefreshTokens,
  refreshing = false,
  confirmRegenerateText
}: {
  targets: QrTarget[];
  loading: boolean;
  onClose: () => void;
  messages: Messages['admin']['qrMenu'];
  closeLabel: string;
  /** Texto sob o título; padrão = messages.description. */
  description?: string;
  /** Aviso em destaque (erro ao carregar, endereço local etc.). */
  notice?: string | null;
  onRefreshTokens?: () => Promise<void>;
  refreshing?: boolean;
  confirmRegenerateText?: string;
}) {
  const [selected, setSelected] = useState<Judge>('center');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.currentTarget === event.target) onClose();
  };

  const handleRefreshClick = () => {
    if (!onRefreshTokens || refreshing) return;
    const confirmed = typeof window === 'undefined' || !confirmRegenerateText ? true : window.confirm(confirmRegenerateText);
    if (!confirmed) return;
    void onRefreshTokens();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 px-4 py-6 sm:items-center sm:px-6 sm:py-10"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={messages.ariaLabel}
    >
      <div className="relative w-full max-w-5xl rounded-3xl border border-white/10 bg-[#0F141F] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.6)] sm:p-8">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-2xl text-white transition hover:bg-white/20 sm:right-6 sm:top-6"
        >
          <span className="sr-only">{closeLabel}</span>
          <span aria-hidden="true">×</span>
        </button>
        <div className="flex flex-col gap-2 pr-14">
          <h2 className="text-lg font-semibold uppercase tracking-[0.12em] text-white sm:tracking-[0.3em]">{messages.title}</h2>
          <p className="text-[15px] text-slate-300">{description ?? messages.description}</p>
          {onRefreshTokens && (
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleRefreshClick}
                disabled={refreshing}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3.5 text-[14px] font-medium text-slate-200 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 11-2.64-6.36" />
                  <path d="M21 4v5h-5" />
                </svg>
                {refreshing ? messages.regenerating : messages.regenerate}
              </button>
            </div>
          )}
        </div>

        {notice && (
          <p className="mt-5 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-[15px] text-amber-100">{notice}</p>
        )}

        {targets.length === 0 && !loading && notice ? null : loading || targets.length === 0 ? (
          <div className="mt-10 text-center text-[15px] text-slate-400">{messages.loading}</div>
        ) : (
          <>
            {/* Tela estreita: escolhe o árbitro; um QR grande por vez */}
            <div className="mt-6 grid grid-cols-3 gap-2 md:hidden" role="tablist">
              {targets.map((target) => (
                <button
                  key={target.judge}
                  type="button"
                  role="tab"
                  aria-selected={selected === target.judge}
                  onClick={() => setSelected(target.judge)}
                  className={`min-h-[52px] truncate whitespace-nowrap rounded-xl px-2 text-[15px] font-semibold transition ${
                    selected === target.judge ? 'bg-white text-slate-950' : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  {target.shortLabel ?? target.label}
                </button>
              ))}
            </div>
            <div className="mt-6 grid gap-6 md:mt-8 md:grid-cols-3">
              {targets.map((target) => (
                <div
                  key={target.judge}
                  className={`flex-col items-center gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-5 text-center ${
                    selected === target.judge ? 'flex' : 'hidden md:flex'
                  }`}
                >
                  {/* Fundo branco: leitor de celular lê melhor QR escuro no claro */}
                  <div className="rounded-2xl bg-white p-4">
                    <QRCode value={target.href} size={220} bgColor="#ffffff" fgColor="#0F141F" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[15px] font-semibold uppercase tracking-[0.15em] text-slate-100 sm:tracking-[0.25em]">{target.label}</span>
                    <span className="break-all text-[13px] text-slate-400">{target.href}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

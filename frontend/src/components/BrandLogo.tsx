/**
 * Logo do Referee Lights (três luzes + nome), o mesmo desenho do site.
 * `size` = lado de cada luz em px.
 */
export function BrandLogo({ size = 28, className = '' }: { size?: number; className?: string }) {
  const icon = Math.round(size * 0.57);
  const check = (
    <svg width={icon} height={icon} viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
  return (
    <div className={`flex flex-col items-center gap-1 ${className}`} aria-label="Referee Lights" role="img">
      <div className="flex" style={{ gap: Math.round(size * 0.18) }}>
        <div className="flex items-center justify-center rounded bg-white" style={{ width: size, height: size }}>{check}</div>
        <div className="flex items-center justify-center rounded bg-red-500" style={{ width: size, height: size }}>
          <svg width={icon} height={icon} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" aria-hidden="true">
            <line x1="18" x2="6" y1="6" y2="18" />
            <line x1="6" x2="18" y1="6" y2="18" />
          </svg>
        </div>
        <div className="flex items-center justify-center rounded bg-white" style={{ width: size, height: size }}>{check}</div>
      </div>
      <div className="flex items-baseline gap-1 uppercase leading-none tracking-tight" style={{ fontSize: Math.max(10, Math.round(size * 0.4)) }}>
        <span className="font-bold text-white">Referee</span>
        <span className="font-black text-red-500">Lights</span>
      </div>
    </div>
  );
}

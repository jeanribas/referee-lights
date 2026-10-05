/**
 * Logo do Referee Lights (três luzes + nome), o mesmo desenho do site.
 * `size` = lado de cada luz em px.
 */
export function BrandLogo({ size = 28, className = '' }: { size?: number; className?: string }) {
  const icon = Math.round(size * 0.57);
  const gap = Math.round(size * 0.18);
  const rowWidth = size * 3 + gap * 2;
  const fontSize = Math.max(10, Math.round(size * 0.4));
  const check = (
    <svg width={icon} height={icon} viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
  return (
    <div className={`flex flex-col items-center gap-1 ${className}`} aria-label="Referee Lights" role="img">
      <div className="flex" style={{ gap }}>
        <div className="flex items-center justify-center rounded bg-white" style={{ width: size, height: size }}>{check}</div>
        <div className="flex items-center justify-center rounded bg-red-500" style={{ width: size, height: size }}>
          <svg width={icon} height={icon} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" aria-hidden="true">
            <line x1="18" x2="6" y1="6" y2="18" />
            <line x1="6" x2="18" y1="6" y2="18" />
          </svg>
        </div>
        <div className="flex items-center justify-center rounded bg-white" style={{ width: size, height: size }}>{check}</div>
      </div>
      {/* Nome sempre na largura exata da fileira de luzes: com a fonte do
          sistema (Segoe no Windows, SF no Mac) a largura mudava de máquina
          para máquina. textLength fixa a largura sem trocar a fonte. */}
      <svg width={rowWidth} height={fontSize} viewBox={`0 0 ${rowWidth} ${fontSize}`} aria-hidden="true" className="block overflow-visible">
        <text x="0" y={fontSize * 0.86} textLength={rowWidth} lengthAdjust="spacingAndGlyphs" fontSize={fontSize} style={{ fontFamily: 'inherit' }}>
          <tspan fill="#ffffff" fontWeight={700}>REFEREE </tspan>
          <tspan fill="#ef4444" fontWeight={900}>LIGHTS</tspan>
        </text>
      </svg>
    </div>
  );
}

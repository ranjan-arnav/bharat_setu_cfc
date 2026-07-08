'use client';

// ─── Shared Government of India UI elements ────────────────────────────────────
// Used across all overlay headers to maintain consistent GoI branding.

/** Tricolor flag stripe — add at the very top of every overlay */
export function FlagStripe({ thick = false }: { thick?: boolean }) {
  const h = thick ? 'h-[3px]' : 'h-[2px]';
  return (
    <div className={`w-full ${h} flex shrink-0`}>
      <div className="flex-1 bg-[#FF9933]" />
      <div className="flex-1 bg-white/60" />
      <div className="flex-1 bg-[#138808]" />
    </div>
  );
}

/** Small 24-spoke Ashoka Chakra SVG */
export function AshokaChakra({
  size = 24,
  spin = false,
  color = '#1a4fa3',
  className = '',
}: {
  size?: number;
  spin?: boolean;
  color?: string;
  className?: string;
}) {
  const spokes = Array.from({ length: 24 }, (_, i) => {
    const angle = (i * 360) / 24;
    const rad = (angle * Math.PI) / 180;
    const r1 = size * 0.32;
    const r2 = size * 0.46;
    const cx = size / 2;
    const cy = size / 2;
    return {
      x1: (cx + r1 * Math.sin(rad)).toFixed(4),
      y1: (cy - r1 * Math.cos(rad)).toFixed(4),
      x2: (cx + r2 * Math.sin(rad)).toFixed(4),
      y2: (cy - r2 * Math.cos(rad)).toFixed(4),
    };
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`${spin ? 'animate-spin' : ''} ${className}`}
      style={spin ? { animationDuration: '10s', animationTimingFunction: 'linear' } : undefined}
    >
      <circle cx={size / 2} cy={size / 2} r={size * 0.47} fill="none" stroke={color} strokeWidth={size * 0.045} />
      <circle cx={size / 2} cy={size / 2} r={size * 0.29} fill="none" stroke={color} strokeWidth={size * 0.035} />
      {spokes.map((s, i) => (
        <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={color} strokeWidth={size * 0.028} />
      ))}
    </svg>
  );
}

/** Compact "भारत सरकार" badge shown in every header */
export function GoiBadge({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-1 bg-[#1a4fa3]/20 border border-[#1a4fa3]/30 rounded-full px-2 py-0.5 ${className}`}>
      <AshokaChakra size={12} color="#5b8def" />
      <span className="text-[8px] font-bold text-[#5b8def] tracking-wider">भारत सरकार</span>
    </div>
  );
}

/** Verified Aadhaar-style badge */
export function VerifiedBadge({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1 bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
      <span className="material-symbols-outlined" style={{ fontSize: '11px', fontVariationSettings: "'FILL' 1" }}>
        verified
      </span>
      {text}
    </span>
  );
}

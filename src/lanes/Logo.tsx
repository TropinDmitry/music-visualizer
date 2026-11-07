/**
 * Логотип игры: три неоновые дорожки уходят вдаль, по ним летят ноты, внизу кольцо
 * нажатия. Цвета те же, что у интерфейса: бирюзовый, фиолетовый и розовый.
 */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <svg className={`logo ${className}`} viewBox="0 0 120 100" role="img" aria-label="Tap Your Track">
      <defs>
        <filter id="logo-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="logo-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.35" stopColor="#fff" stopOpacity="1" />
        </linearGradient>
        <mask id="logo-mask">
          <rect width="120" height="100" fill="url(#logo-fade)" />
        </mask>
      </defs>
      <g filter="url(#logo-glow)" strokeLinecap="round" fill="none" mask="url(#logo-mask)">
        <path className="logo-lane" d="M26 90 L52 6" stroke="#2ef2ff" strokeWidth="3.4" />
        <path className="logo-lane" d="M60 90 L60 6" stroke="#a259ff" strokeWidth="3.4" />
        <path className="logo-lane" d="M94 90 L68 6" stroke="#ff4fd8" strokeWidth="3.4" />
      </g>
      <g filter="url(#logo-glow)">
        <circle className="logo-note" cx="45.5" cy="27" r="3.6" fill="#2ef2ff" />
        <circle className="logo-note" cx="60" cy="46" r="4.6" fill="#a259ff" />
        <circle className="logo-note" cx="81.5" cy="49" r="4.8" fill="#ff4fd8" />
        <ellipse className="logo-ring" cx="60" cy="86" rx="15" ry="6" fill="none" stroke="#ffffff" strokeWidth="2.6" />
      </g>
    </svg>
  )
}

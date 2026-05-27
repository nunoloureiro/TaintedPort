export default function Logo({ size = 'md', className = '' }) {
  const sizes = {
    sm: { w: 28, h: 28, text: 'text-lg' },
    md: { w: 32, h: 32, text: 'text-xl' },
    lg: { w: 48, h: 48, text: 'text-3xl' },
    xl: { w: 64, h: 64, text: 'text-5xl' },
  };

  const s = sizes[size] || sizes.md;

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg
        width={s.w}
        height={s.h}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
      >
        {/* Port glass bowl */}
        <defs>
          <linearGradient id="portWine" x1="32" y1="18" x2="32" y2="44" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#7C3AED" />
            <stop offset="100%" stopColor="#4C1D95" />
          </linearGradient>
          <linearGradient id="glassShine" x1="20" y1="18" x2="44" y2="44" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="stemGrad" x1="32" y1="44" x2="32" y2="58" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#A78BFA" />
            <stop offset="100%" stopColor="#6D28D9" />
          </linearGradient>
        </defs>

        {/* Glass bowl - wide port glass shape */}
        <path
          d="M16 14 C16 14, 14 30, 18 38 C20 42, 24 44, 30 44 L34 44 C40 44, 44 42, 46 38 C50 30, 48 14, 48 14 Z"
          fill="url(#portWine)"
          stroke="#A78BFA"
          strokeWidth="1.5"
        />

        {/* Glass shine */}
        <path
          d="M20 16 C20 16, 18 28, 21 35 C22 37, 24 38, 26 38"
          stroke="url(#glassShine)"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />

        {/* Glass rim */}
        <path
          d="M16 14 L48 14"
          stroke="#C4B5FD"
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* Stem */}
        <line x1="32" y1="44" x2="32" y2="54" stroke="url(#stemGrad)" strokeWidth="2.5" strokeLinecap="round" />

        {/* Base */}
        <ellipse cx="32" cy="56" rx="10" ry="2.5" fill="#6D28D9" stroke="#A78BFA" strokeWidth="1" />

        {/* Skull/warning - small biohazard-style icon on the glass */}
        <g transform="translate(25, 22)" opacity="0.9">
          {/* Skull outline */}
          <circle cx="7" cy="5.5" r="5.5" fill="#1E1B4B" stroke="#C4B5FD" strokeWidth="0.8" />
          {/* Eyes */}
          <circle cx="5" cy="4.5" r="1.2" fill="#F87171" />
          <circle cx="9" cy="4.5" r="1.2" fill="#F87171" />
          {/* Nose */}
          <path d="M6.5 7 L7.5 7 L7 6" fill="#C4B5FD" />
          {/* Jaw */}
          <path d="M4 9 L10 9" stroke="#C4B5FD" strokeWidth="0.6" strokeLinecap="round" />
          <line x1="5.5" y1="8" x2="5.5" y2="10" stroke="#C4B5FD" strokeWidth="0.5" />
          <line x1="7" y1="8" x2="7" y2="10" stroke="#C4B5FD" strokeWidth="0.5" />
          <line x1="8.5" y1="8" x2="8.5" y2="10" stroke="#C4B5FD" strokeWidth="0.5" />
        </g>

        {/* Tiny drip on rim for "tainted" effect */}
        <path
          d="M40 14 Q41 17, 40 19 Q39 17, 40 14"
          fill="#7C3AED"
          opacity="0.7"
        />
      </svg>
      <span className={`font-bold gradient-text ${s.text}`}>
        Tainted<span className="text-accent-purple-light">Port</span>
      </span>
    </span>
  );
}

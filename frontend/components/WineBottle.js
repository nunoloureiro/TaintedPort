'use client';

/**
 * Stylized SVG wine bottle illustration.
 * Colors and label vary based on wine type.
 */

const typeConfig = {
  Red: {
    wine: '#6B1A2A',
    wineHighlight: '#8B2240',
    glass: '#1A3A1A',
    glassHighlight: '#2A5A2A',
    label: '#F5E6D0',
    labelAccent: '#8B2240',
    capsule: '#8B2240',
    capsuleHighlight: '#A0334F',
  },
  White: {
    wine: '#D4C98A',
    wineHighlight: '#E0D89E',
    glass: '#2A4A2A',
    glassHighlight: '#3A6A3A',
    label: '#FFFFF0',
    labelAccent: '#7A8B4A',
    capsule: '#C8B860',
    capsuleHighlight: '#D8C870',
  },
  Rosé: {
    wine: '#D4768A',
    wineHighlight: '#E08A9E',
    glass: '#2A3A2A',
    glassHighlight: '#3A5A3A',
    label: '#FFF0F5',
    labelAccent: '#C0607A',
    capsule: '#D06A80',
    capsuleHighlight: '#E07A90',
  },
  Sparkling: {
    wine: '#D0CC8A',
    wineHighlight: '#E0DC9E',
    glass: '#1A3A2A',
    glassHighlight: '#2A5A3A',
    label: '#F8F8FF',
    labelAccent: '#4A6A8A',
    capsule: '#C0A030',
    capsuleHighlight: '#D0B040',
  },
  Port: {
    wine: '#3A0A1A',
    wineHighlight: '#5A1A2A',
    glass: '#1A2A1A',
    glassHighlight: '#2A4A2A',
    label: '#F0E0C8',
    labelAccent: '#5A1A2A',
    capsule: '#4A0A1A',
    capsuleHighlight: '#6A1A2A',
  },
  Fortified: {
    wine: '#4A1A0A',
    wineHighlight: '#6A2A1A',
    glass: '#1A2A1A',
    glassHighlight: '#2A4A2A',
    label: '#F0E0C8',
    labelAccent: '#6A3A1A',
    capsule: '#5A2A0A',
    capsuleHighlight: '#7A3A1A',
  },
};

export default function WineBottle({ type = 'Red', name = '', size = 'md', className = '' }) {
  const config = typeConfig[type] || typeConfig.Red;

  const sizes = {
    sm: { width: 60, height: 160 },
    md: { width: 80, height: 200 },
    lg: { width: 120, height: 300 },
    xl: { width: 160, height: 400 },
  };

  const { width, height } = sizes[size] || sizes.md;

  // Derive a seed from the name for slight visual variation
  const seed = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const labelYOffset = (seed % 5) - 2; // -2 to +2
  const labelPattern = seed % 3; // 0, 1, or 2

  return (
    <svg
      viewBox="0 0 100 260"
      width={width}
      height={height}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Bottle glass gradient */}
        <linearGradient id={`glass-${seed}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={config.glass} />
          <stop offset="35%" stopColor={config.glassHighlight} />
          <stop offset="65%" stopColor={config.glassHighlight} />
          <stop offset="100%" stopColor={config.glass} />
        </linearGradient>

        {/* Wine fill gradient */}
        <linearGradient id={`wine-${seed}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={config.wine} />
          <stop offset="40%" stopColor={config.wineHighlight} />
          <stop offset="100%" stopColor={config.wine} />
        </linearGradient>

        {/* Glass reflection */}
        <linearGradient id={`reflect-${seed}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(255,255,255,0)" />
          <stop offset="30%" stopColor="rgba(255,255,255,0.08)" />
          <stop offset="50%" stopColor="rgba(255,255,255,0.12)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>

        {/* Capsule gradient */}
        <linearGradient id={`capsule-${seed}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={config.capsule} />
          <stop offset="50%" stopColor={config.capsuleHighlight} />
          <stop offset="100%" stopColor={config.capsule} />
        </linearGradient>

        {/* Subtle shadow */}
        <filter id={`shadow-${seed}`}>
          <feDropShadow dx="2" dy="4" stdDeviation="3" floodOpacity="0.3" />
        </filter>
      </defs>

      <g filter={`url(#shadow-${seed})`}>
        {/* === Capsule/Foil (top cap) === */}
        <rect x="40" y="8" width="20" height="18" rx="2" fill={`url(#capsule-${seed})`} />
        <rect x="38" y="22" width="24" height="6" rx="1" fill={config.capsule} />
        {/* Capsule top */}
        <rect x="42" y="5" width="16" height="5" rx="3" fill={config.capsuleHighlight} />

        {/* === Neck === */}
        <rect x="42" y="28" width="16" height="55" rx="1" fill={`url(#glass-${seed})`} />
        {/* Wine visible in neck */}
        <rect x="42" y="50" width="16" height="33" rx="1" fill={`url(#wine-${seed})`} opacity="0.7" />
        {/* Neck reflection */}
        <rect x="48" y="28" width="4" height="55" rx="1" fill="rgba(255,255,255,0.06)" />

        {/* === Shoulder (transition neck to body) === */}
        <path
          d="M42,83 Q42,95 25,105 L25,105 L75,105 Q58,95 58,83 Z"
          fill={`url(#glass-${seed})`}
        />
        <path
          d="M42,83 Q42,95 25,105 L25,105 L75,105 Q58,95 58,83 Z"
          fill={`url(#wine-${seed})`}
          opacity="0.7"
        />

        {/* === Body === */}
        <rect x="25" y="105" width="50" height="120" rx="2" fill={`url(#glass-${seed})`} />
        {/* Wine fill in body */}
        <rect x="25" y="105" width="50" height="120" rx="2" fill={`url(#wine-${seed})`} opacity="0.65" />

        {/* === Bottom curve === */}
        <path
          d="M25,225 Q25,240 30,245 L70,245 Q75,240 75,225 Z"
          fill={`url(#glass-${seed})`}
        />
        <path
          d="M25,225 Q25,240 30,245 L70,245 Q75,240 75,225 Z"
          fill={`url(#wine-${seed})`}
          opacity="0.65"
        />

        {/* === Punt (bottom indentation) === */}
        <ellipse cx="50" cy="245" rx="20" ry="4" fill={config.glass} opacity="0.8" />

        {/* === Glass reflection (full body) === */}
        <rect x="25" y="105" width="50" height="140" rx="2" fill={`url(#reflect-${seed})`} />
        <rect x="30" y="110" width="6" height="100" rx="3" fill="rgba(255,255,255,0.05)" />

        {/* === Label === */}
        <g transform={`translate(0, ${labelYOffset})`}>
          {/* Label background */}
          <rect x="28" y="130" width="44" height="65" rx="3" fill={config.label} />
          {/* Label border */}
          <rect x="28" y="130" width="44" height="65" rx="3" fill="none" stroke={config.labelAccent} strokeWidth="0.5" opacity="0.4" />

          {/* Label inner border decoration */}
          <rect x="31" y="133" width="38" height="59" rx="2" fill="none" stroke={config.labelAccent} strokeWidth="0.3" opacity="0.25" />

          {/* Label content varies by pattern */}
          {labelPattern === 0 && (
            <>
              {/* Classic: horizontal lines + crest */}
              <circle cx="50" cy="148" r="8" fill="none" stroke={config.labelAccent} strokeWidth="0.6" opacity="0.5" />
              <line x1="46" y1="148" x2="54" y2="148" stroke={config.labelAccent} strokeWidth="0.4" opacity="0.4" />
              <line x1="50" y1="144" x2="50" y2="152" stroke={config.labelAccent} strokeWidth="0.4" opacity="0.4" />
              <rect x="35" y="160" width="30" height="1" rx="0.5" fill={config.labelAccent} opacity="0.35" />
              <rect x="38" y="164" width="24" height="1" rx="0.5" fill={config.labelAccent} opacity="0.25" />
              <rect x="36" y="172" width="28" height="2.5" rx="1" fill={config.labelAccent} opacity="0.5" />
              <rect x="40" y="178" width="20" height="1" rx="0.5" fill={config.labelAccent} opacity="0.2" />
              <rect x="35" y="184" width="30" height="1" rx="0.5" fill={config.labelAccent} opacity="0.15" />
            </>
          )}
          {labelPattern === 1 && (
            <>
              {/* Modern: bold stripe + minimal text lines */}
              <rect x="28" y="145" width="44" height="12" fill={config.labelAccent} opacity="0.12" />
              <rect x="35" y="149" width="30" height="3" rx="1" fill={config.labelAccent} opacity="0.5" />
              <rect x="37" y="162" width="26" height="1" rx="0.5" fill={config.labelAccent} opacity="0.35" />
              <rect x="40" y="167" width="20" height="1" rx="0.5" fill={config.labelAccent} opacity="0.2" />
              <rect x="38" y="176" width="24" height="2" rx="1" fill={config.labelAccent} opacity="0.4" />
              <rect x="42" y="182" width="16" height="1" rx="0.5" fill={config.labelAccent} opacity="0.2" />
            </>
          )}
          {labelPattern === 2 && (
            <>
              {/* Elegant: diamond + fine lines */}
              <polygon points="50,138 56,148 50,158 44,148" fill="none" stroke={config.labelAccent} strokeWidth="0.5" opacity="0.4" />
              <polygon points="50,142 53,148 50,154 47,148" fill={config.labelAccent} opacity="0.1" />
              <rect x="34" y="163" width="32" height="1" rx="0.5" fill={config.labelAccent} opacity="0.3" />
              <rect x="36" y="168" width="28" height="2.5" rx="1" fill={config.labelAccent} opacity="0.45" />
              <rect x="38" y="174" width="24" height="1" rx="0.5" fill={config.labelAccent} opacity="0.25" />
              <rect x="41" y="180" width="18" height="1" rx="0.5" fill={config.labelAccent} opacity="0.2" />
              <rect x="34" y="186" width="32" height="1" rx="0.5" fill={config.labelAccent} opacity="0.15" />
            </>
          )}
        </g>
      </g>
    </svg>
  );
}

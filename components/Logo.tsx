import React from 'react';

interface KairosLogoProps {
  size?: number;
  className?: string;
  variant?: 'light' | 'dark' | 'amber';
}

export const KairosLogo: React.FC<KairosLogoProps> = ({ size = 40, className = '', variant = 'amber' }) => {
  const stemColor  = variant === 'dark' ? '#FFFFFF' : variant === 'light' ? '#0F1E38' : '#E8962A';
  const accentDot  = variant === 'dark' ? 'rgba(255,255,255,0.25)' : variant === 'light' ? 'rgba(15,30,56,0.18)' : 'rgba(232,150,42,0.25)';
  const accentCore = variant === 'dark' ? '#FFFFFF' : variant === 'light' ? '#0F1E38' : '#E8962A';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Kairos"
      role="img"
    >
      {/* Vertical stem */}
      <line x1="12" y1="5"  x2="12" y2="35" stroke={stemColor} strokeWidth="5.5" strokeLinecap="round" />
      {/* Upper arm */}
      <line x1="12" y1="20" x2="33" y2="5"  stroke={stemColor} strokeWidth="5.5" strokeLinecap="round" />
      {/* Lower arm */}
      <line x1="12" y1="20" x2="33" y2="35" stroke={stemColor} strokeWidth="5.5" strokeLinecap="round" />
      {/* Focal accent — the decisive moment */}
      <circle cx="12" cy="20" r="5"   fill={accentDot} />
      <circle cx="12" cy="20" r="2.8" fill={accentCore} />
    </svg>
  );
};

export const KairosWordmark: React.FC<{ className?: string; color?: string }> = ({
  className = '',
  color = 'currentColor',
}) => (
  <svg
    width="76"
    height="20"
    viewBox="0 0 76 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-label="Kairos"
    role="img"
  >
    <text
      x="0"
      y="15"
      fontFamily='"Plus Jakarta Sans", system-ui, sans-serif'
      fontSize="16"
      fontWeight="700"
      letterSpacing="-0.3"
      fill={color}
    >
      Kairos
    </text>
  </svg>
);

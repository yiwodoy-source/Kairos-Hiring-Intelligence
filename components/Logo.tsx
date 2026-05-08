import React from 'react';

interface KairosLogoProps {
  size?: number;
  className?: string;
}

export const KairosLogo: React.FC<KairosLogoProps> = ({ size = 40, className = '' }) => (
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
    <line
      x1="12" y1="5"
      x2="12" y2="35"
      stroke="#8B5CF6"
      strokeWidth="6"
      strokeLinecap="round"
    />
    {/* Upper arm */}
    <line
      x1="12" y1="20"
      x2="33" y2="5"
      stroke="#8B5CF6"
      strokeWidth="6"
      strokeLinecap="round"
    />
    {/* Lower arm */}
    <line
      x1="12" y1="20"
      x2="33" y2="35"
      stroke="#8B5CF6"
      strokeWidth="6"
      strokeLinecap="round"
    />
    {/* The decisive moment — focal accent at the junction */}
    <circle cx="12" cy="20" r="4.5" fill="#DDD6FE" />
    <circle cx="12" cy="20" r="2.5" fill="#8B5CF6" />
  </svg>
);

export const KairosWordmark: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    width="82"
    height="20"
    viewBox="0 0 82 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-label="Kairos"
    role="img"
  >
    <text
      x="0"
      y="15"
      fontFamily="Inter, system-ui, sans-serif"
      fontSize="16"
      fontWeight="700"
      letterSpacing="-0.5"
      fill="currentColor"
    >
      Kairos
    </text>
  </svg>
);

import React from 'react';

export const MCloudLogo: React.FC<{ className?: string }> = ({ className = 'w-7 h-7' }) => (
  <svg
    viewBox="0 0 36 36"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <rect width="36" height="36" rx="8" className="fill-slate-900 dark:fill-blue-700" />
    <path
      d="M9 23.5V12.5L14.5 18.5L18 14L21.5 18.5L27 12.5V23.5"
      stroke="#F1F5F9"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M9 27H27"
      stroke="#38BDF8"
      strokeWidth="2.2"
      strokeLinecap="round"
    />
  </svg>
);

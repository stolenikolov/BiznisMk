const ICON_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function FinanceIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20V13" />
      <path d="M3 20h18" />
    </svg>
  );
}

export function TeamIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="7.5" r="2.3" />
      <path d="M15.5 12.3c2.6.5 4.5 2.7 4.5 5.5" />
    </svg>
  );
}

export function InvoiceIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M6 3h9l3 3v15H6z" />
      <path d="M15 3v3h3" />
      <path d="M9 11h6" />
      <path d="M9 14.5h6" />
      <path d="M9 18h3.5" />
    </svg>
  );
}

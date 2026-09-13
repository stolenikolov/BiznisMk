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

/** Placeholder marker for a product screenshot slot that isn't built yet. */
export function ImageIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="M21 16l-5-4.5L9 19" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}

export function BellIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M6.5 9.5a5.5 5.5 0 0111 0c0 4 1.5 5.5 1.5 5.5H5s1.5-1.5 1.5-5.5z" />
      <path d="M10 18.5a2 2 0 004 0" />
    </svg>
  );
}

/** Generic placeholder avatar — real profile photos come later. */
export function PersonIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <circle cx="12" cy="9" r="3.2" />
      <path d="M5.5 19.5c0-3.3 2.9-5.8 6.5-5.8s6.5 2.5 6.5 5.8" />
    </svg>
  );
}

export function SunIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
    </svg>
  );
}

export function MoonIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" />
    </svg>
  );
}

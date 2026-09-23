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

export function BellIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M6.5 9.5a5.5 5.5 0 0111 0c0 4 1.5 5.5 1.5 5.5H5s1.5-1.5 1.5-5.5z" />
      <path d="M10 18.5a2 2 0 004 0" />
    </svg>
  );
}

/** Show a hidden password. */
export function EyeIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  );
}

/** Hide a shown password. */
export function EyeOffIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M9.9 5.7A9.8 9.8 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 01-2.6 3.4" />
      <path d="M6.1 7.4C3.8 9.1 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.7 0 3.2-.5 4.5-1.2" />
      <path d="M10 10a2.8 2.8 0 004 4" />
      <path d="M3.5 3.5l17 17" />
    </svg>
  );
}

/** An envelope: writing to people by email. */
export function MailIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="M4.5 7.5l7.5 5.5 7.5-5.5" />
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

export function ChevronDownIcon() {
  return (
    <svg {...ICON_PROPS} strokeWidth={2.2} aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function DownloadIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

/** Solid triangle for a trend delta — direction is set by the caller. */
export function TrendArrowIcon({ direction }: { direction: 'up' | 'down' }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d={direction === 'up' ? 'M6 2 L10 9 L2 9 Z' : 'M6 10 L2 3 L10 3 Z'} />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg {...ICON_PROPS} strokeWidth={2} aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** Opens the section menu on narrow screens. */
export function MenuIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** Photo slot on the add-employee form. */
export function CameraIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M4 8.5A1.5 1.5 0 015.5 7h2.2l1.4-2h5.8l1.4 2h2.2A1.5 1.5 0 0120 8.5v9a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 17.5z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  );
}

export function ChevronLeftIcon() {
  return (
    <svg {...ICON_PROPS} strokeWidth={2} aria-hidden="true">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

export function ChevronRightIcon() {
  return (
    <svg {...ICON_PROPS} strokeWidth={2} aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/** A day that cannot be scheduled, or a week that is locked. */
export function LockIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M9 7V4.5h6V7" />
      <path d="M6.5 7l1 12.5h9l1-12.5" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg {...ICON_PROPS} strokeWidth={2} aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function LogoutIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M10 4.5H6.5A1.5 1.5 0 005 6v12a1.5 1.5 0 001.5 1.5H10" />
      <path d="M15 8l4 4-4 4" />
      <path d="M19 12H9.5" />
    </svg>
  );
}

export function PhoneIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M6.5 3.5h3l1.5 4-2 1.5a10 10 0 005 5l1.5-2 4 1.5v3a1.5 1.5 0 01-1.7 1.5C11.6 17.8 6.2 12.4 5 5.2A1.5 1.5 0 016.5 3.5z" />
    </svg>
  );
}

/** Pins a postal address in the footer's contact list. */
export function LocationIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M12 21s6.5-6.1 6.5-10.5a6.5 6.5 0 10-13 0C5.5 14.9 12 21 12 21z" />
      <circle cx="12" cy="10.5" r="2.4" />
    </svg>
  );
}

export function ClockIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

/** Paying out — the payroll button in the team header. */
export function WalletIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M3.5 8.5A2 2 0 015.5 6.5h13a2 2 0 012 2v9a2 2 0 01-2 2h-13a2 2 0 01-2-2z" />
      <path d="M3.5 10.5h17" />
      <circle cx="16.5" cy="14.5" r="1.2" />
    </svg>
  );
}

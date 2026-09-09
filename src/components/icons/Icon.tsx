// Sistem ikon SVG reusable — square monoline, stroke currentColor, tanpa fill.
// Sesuai DESIGN.md: "Iconography is square monoline, set in Ink with no fill".
// Penggunaan: <Icon name="bell" size={20} /> — JANGAN pakai emoji di UI.
import type { SVGProps } from 'react';
import type { ReactElement } from 'react';

export type IconName =
  | 'arrow-left'
  | 'arrow-right'
  | 'arrow-up'
  | 'assistant'
  | 'attach'
  | 'bell'
  | 'building'
  | 'calendar'
  | 'camera'
  | 'chart'
  | 'chat'
  | 'check'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'clock'
  | 'close'
  | 'dashboard'
  | 'document'
  | 'download'
  | 'edit'
  | 'eye'
  | 'filter'
  | 'finance'
  | 'globe'
  | 'info'
  | 'inventory'
  | 'layers'
  | 'lock'
  | 'logout'
  | 'mail'
  | 'menu'
  | 'minus'
  | 'offline'
  | 'online'
  | 'phone'
  | 'plus'
  | 'pos'
  | 'printer'
  | 'receipt'
  | 'scan'
  | 'search'
  | 'settings'
  | 'star'
  | 'store'
  | 'sync'
  | 'tag'
  | 'thumb-down'
  | 'thumb-up'
  | 'trash'
  | 'trending-down'
  | 'trending-up'
  | 'user'
  | 'users'
  | 'wallet'
  | 'warehouse'
  | 'warning'
  | 'sun'
  | 'moon'
  | 'copy'
  | 'sparkles'
  | 'dots';

const paths: Record<IconName, ReactElement> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </>
  ),
  inventory: (
    <>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
      <path d="M4 7.5l8 4.5 8-4.5" />
      <path d="M12 12v9" />
    </>
  ),
  pos: (
    <>
      <path d="M4 4h2l2.4 10.4a1.5 1.5 0 0 0 1.47 1.1h6.66a1.5 1.5 0 0 0 1.45-1.12L19.5 8H6.5" />
      <circle cx="9.5" cy="20" r="1.4" />
      <circle cx="16.5" cy="20" r="1.4" />
    </>
  ),
  finance: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 12h.01M18 12h.01" />
    </>
  ),
  assistant: (
    <>
      <path d="M12 3.5l1.7 4.6 4.6 1.7-4.6 1.7L12 16.1l-1.7-4.6-4.6-1.7 4.6-1.7L12 3.5z" />
      <path d="M18.5 14.5l.85 2.15 2.15.85-2.15.85-.85 2.15-.85-2.15-2.15-.85 2.15-.85.85-2.15z" />
    </>
  ),
  settings: (
    <>
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h13M20 18h0" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="19" cy="18" r="2" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8.5a6 6 0 1 0-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 15 18 8.5" />
      <path d="M13.7 20a2 2 0 0 1-3.4 0" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </>
  ),
  scan: (
    <>
      <path d="M3.5 7.5V5.5a2 2 0 0 1 2-2h2M16.5 3.5h2a2 2 0 0 1 2 2v2M20.5 16.5v2a2 2 0 0 1-2 2h-2M7.5 20.5h-2a2 2 0 0 1-2-2v-2" />
      <path d="M7.5 8.5v7M11 8.5v7M14.5 8.5v7M17 8.5v7" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  trash: (
    <>
      <path d="M3.5 6.5h17M8.5 6.5V4.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v2M19 6.5l-.8 12.4a2 2 0 0 1-2 1.6H7.8a2 2 0 0 1-2-1.6L5 6.5" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  'chevron-right': <path d="M9 6l6 6-6 6" />,
  'chevron-left': <path d="M15 6l-6 6 6 6" />,
  'chevron-down': <path d="M6 9l6 6 6-6" />,
  'arrow-left': <path d="M19 12H5M11 18l-6-6 6-6" />,
  'arrow-up': <path d="M12 19V5M5 12l7-7 7 7" />,
  'arrow-right': <path d="M5 12h14M13 6l6 6-6 6" />,
  check: <path d="M4.5 12.5l5 5L19.5 7" />,
  warning: (
    <>
      <path d="M12 3.5L22 20H2L12 3.5z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  sync: (
    <>
      <path d="M21 4v6h-6" />
      <path d="M20.5 15a9 9 0 1 1-2.1-9.3L21 10" />
    </>
  ),
  offline: (
    <>
      <path d="M3 3l18 18" />
      <path d="M8.5 16.5a5.5 5.5 0 0 1 7 0" />
      <path d="M5 12.6a11 11 0 0 1 3-2.1M10.7 8.3c.43-.03.86-.05 1.3-.05 2.9 0 5.66.82 8 2.24" />
      <path d="M12 20h.01" />
    </>
  ),
  online: (
    <>
      <path d="M5 12.6a11 11 0 0 1 14 0" />
      <path d="M1.9 9a16 16 0 0 1 20.2 0" />
      <path d="M8.5 16.1a6 6 0 0 1 7 0" />
      <path d="M12 20h.01" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 5.6a3.5 3.5 0 0 1 0 5.8M18.5 14.4a6.5 6.5 0 0 1 3 5.6" />
    </>
  ),
  store: (
    <>
      <path d="M4 9.5L5.6 4h12.8L20 9.5" />
      <path d="M4 9.5h16V20H4zM4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0" />
      <path d="M9.5 20v-5.5h5V20" />
    </>
  ),
  warehouse: (
    <>
      <path d="M3 21V9.5L12 3.5l9 6V21" />
      <path d="M7 21v-8h10v8M7 16.5h10" />
    </>
  ),
  document: (
    <>
      <path d="M6 2.5h9L19.5 7v14.5h-13.5z" />
      <path d="M14.5 2.5V7.5h5M9.5 12h5.5M9.5 15.5h5.5" />
    </>
  ),
  receipt: (
    <>
      <path d="M5.5 2.5h13V21l-2.2-1.5L14 21l-2-1.5L10 21l-2.3-1.5L5.5 21z" />
      <path d="M9 7.5h6M9 11.5h6" />
    </>
  ),
  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10.5l5 5 5-5M12 15.5V3" />
    </>
  ),
  logout: (
    <>
      <path d="M9.5 21H5.5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9.5" />
    </>
  ),
  filter: <path d="M21.5 3.5h-19l7.5 9v6l4 2.5v-8.5l7.5-9z" />,
  edit: <path d="M17 3.5a2.8 2.8 0 0 1 4 4L8 20.5l-5 1 1-5L17 3.5z" />,
  camera: (
    <>
      <path d="M22.5 18.5a2 2 0 0 1-2 2h-17a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.5l2-3h6l2 3h3.5a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="3.6" />
    </>
  ),
  menu: <path d="M4 6.5h16M4 12h16M4 17.5h16" />,
  star: <path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9 6.6 19.8l1.1-6.1L3.2 9.4l6.1-.8L12 3z" />,
  'trending-up': (
    <>
      <path d="M22 6.5l-8.5 8.5-5-5L2 16.5" />
      <path d="M16.5 6.5H22V12" />
    </>
  ),
  'trending-down': (
    <>
      <path d="M22 17.5L13.5 9l-5 5L2 7.5" />
      <path d="M16.5 17.5H22V12" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5.5l3.5 2" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M3.5 10h17M8 2.5V6.5M16 2.5V6.5" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </>
  ),
  mail: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </>
  ),
  phone: (
    <path d="M21 16.9v2.6a2 2 0 0 1-2.2 2 19.5 19.5 0 0 1-8.5-3 19 19 0 0 1-5.8-5.8 19.5 19.5 0 0 1-3-8.6A2 2 0 0 1 3.5 2h2.6a2 2 0 0 1 2 1.7c.13.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.1L7.3 9.7a16 16 0 0 0 5.8 5.8l1.1-1.05a2 2 0 0 1 2.1-.45c.9.34 1.84.57 2.8.7a2 2 0 0 1 1.9 2.2z" />
  ),
  building: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="1" />
      <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3" />
    </>
  ),
  tag: (
    <>
      <path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z" />
      <path d="M7 7h.01" />
    </>
  ),
  layers: (
    <>
      <path d="M12 2.5L22 7.5l-10 5-10-5 10-5z" />
      <path d="M2 12.5l10 5 10-5M2 17.5l10 5 10-5" />
    </>
  ),
  chat: <path d="M21 15a2 2 0 0 1-2 2H7.5L3 21V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  attach: (
    <path d="M20.5 11.5l-8.5 8.5a5.5 5.5 0 0 1-7.8-7.8l9-9a3.8 3.8 0 0 1 5.4 5.4l-8.5 8.5a2.1 2.1 0 0 1-3-3l7.8-7.8" />
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.3 2.3 3.5 5.2 3.5 8.5s-1.2 6.2-3.5 8.5c-2.3-2.3-3.5-5.2-3.5-8.5s1.2-6.2 3.5-8.5z" />
    </>
  ),
  printer: (
    <>
      <path d="M6.5 9V3h11v6" />
      <rect x="3" y="9" width="18" height="8" rx="1.5" />
      <path d="M6.5 14h11v7h-11z" />
    </>
  ),
  dots: (
    <>
      <circle cx="5" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="19" cy="12" r="1" fill="currentColor" />
    </>
  ),
  wallet: (
    <>
      <path d="M20 7.5H5a2 2 0 0 1 0-4h13v4" />
      <path d="M20 7.5a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-13" />
      <path d="M16.5 14h.01" />
    </>
  ),
  chart: (
    <>
      <path d="M3.5 3.5V20.5h17" />
      <path d="M8 16.5v-5M12.5 16.5V7.5M17 16.5v-8" />
    </>
  ),
  'thumb-up': (
    <path d="M7 10.5v10M7 20.5H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h3m0 10h9.3a2 2 0 0 0 2-1.6l1.5-7a2 2 0 0 0-2-2.4H14l1-4.5a2.4 2.4 0 0 0-4.6-1L7 10.5" />
  ),
  'thumb-down': (
    <path d="M17 13.5v-10M17 3.5h3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-3m0-10H7.7a2 2 0 0 0-2 1.6l-1.5 7a2 2 0 0 0 2 2.4H10l-1 4.5a2.4 2.4 0 0 0 4.6 1L17 13.5" />
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </>
  ),
  moon: (
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  ),
  copy: (
    <>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M6.34 6.34l2.12 2.12M15.54 15.54l2.12 2.12M6.34 17.66l2.12-2.12M15.54 8.46l2.12-2.12" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}

export function Icon({ name, size = 20, strokeWidth = 1.5, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}

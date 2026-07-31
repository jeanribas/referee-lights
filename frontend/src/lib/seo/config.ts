const DEFAULT_TITLE = 'Referee Lights · Real-Time Referee Light System for IPF Powerlifting';
const DEFAULT_DESCRIPTION =
  'Free, open-source referee light system for IPF Powerlifting competitions. Real-time sync, penalty cards, timer, chroma key overlay, QR code access, PWA. Works on any device.';

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'https://refereelights.app';

export const OG_IMAGE_URL = `${SITE_URL}/screenshots/display.jpg`;

export const SEO_DEFAULTS = {
  siteName: 'Referee Lights',
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
  twitterHandle: '@refereelights',
  themeColor: '#0B1628'
} as const;

// Robô pelo User-Agent. UA vazio conta como robô.

const BOT_UA_RE = new RegExp(
  [
    '\\bbot\\b',
    '\\bcrawler\\b',
    '\\bspider\\b',
    'googlebot|bingbot|slurp|duckduckbot|baiduspider|yandexbot|applebot',
    'petalbot|ahrefsbot|semrushbot|mj12bot|dotbot|bytespider',
    'facebookexternalhit|twitterbot|linkedinbot|slackbot|discordbot',
    'telegrambot|skypeuripreview|redditbot|pinterestbot|pinterest\\/0\\.',
    'google-inspectiontool|headlesschrome|headless|lighthouse|pagespeed',
    'python-requests|python-urllib|aiohttp|httpx|scrapy',
    'curl\\/|wget|go-http-client|node-fetch|axios|okhttp|java\\/|libwww',
    'phantomjs|puppeteer|playwright|\\bpreview\\b',
  ].join('|'),
  'i'
);

// Crawler com nome próprio e versão (ClaudeBot/1.0). Sensível a maiúscula no
// nome, para não pegar marca de aparelho como 'CUBOT X70'.
const BOT_NAME_VERSION_RE = /\b[A-Za-z][A-Za-z-]*[Bb]ot\/\d/;

// Preview de link do WhatsApp: UA só 'WhatsApp/x.y', sem 'Mozilla/'.
const WHATSAPP_PREVIEW_RE = /^WhatsApp\/\d/;

export function isBotUserAgent(ua: string): boolean {
  const value = ua.trim();
  if (value === '') return true;
  return BOT_UA_RE.test(value) || BOT_NAME_VERSION_RE.test(value) || WHATSAPP_PREVIEW_RE.test(value);
}

// Robô pelo User-Agent (bot-ua): navegador humano e in-app não é robô; crawler,
// preview de link, headless e cliente HTTP são. UA vazio é robô.
import { describe, expect, it } from 'vitest';

import { isBotUserAgent } from '../src/bot-ua.js';

const HUMAN_UAS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (Linux; Android 14; CUBOT X70) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
  // Navegadores in-app: humanos, mesmo com nome de rede social no UA.
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [Pinterest/iOS]",
  "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36 [Pinterest/Android]",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0.0.0.0;FBDV/iPhone15,2;]",
  "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36 [FB_IAB/Orca-Android;FBAV/450.0.0.0.0;]",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0.1 (iPhone15,2; iOS 17_4)",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 LinkedInApp",
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36 BytedanceWebview/d8a21c6 trill_320 musical_ly_32.0.0",
  "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36 WhatsApp/2.24.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/24.1.80",
  "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36 Telegram-Android/10.9.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Line/14.5.0",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Snapchat/12.0.0.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 GSA/300.0.598994205 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36",
];

const BOT_UAS = [
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
  "WhatsApp/2.23.20.0", // preview de link: só WhatsApp/x.y.z
  "Discordbot/2.0",
  "Twitterbot/1.0",
  "LinkedInBot/1.0 (compatible; Mozilla/5.0)",
  "Mozilla/5.0 (compatible; AhrefsBot/7.0)",
  "Mozilla/5.0 (compatible; SemrushBot/7~bl)",
  "Mozilla/5.0 (compatible; PetalBot;+https://webmaster.petalsearch.com/)",
  "Mozilla/5.0 (compatible; YandexBot/3.0)",
  "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
  "Mozilla/5.0 (compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot)",
  "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.0; +https://openai.com/gptbot)",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)",
  "Mozilla/5.0 (compatible; CCBot/2.0; +http://commoncrawl.org/faq/)",
  "Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)",
  "Mozilla/5.0 (compatible; Google-InspectionTool/1.0)",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)",
  "Mozilla/5.0 (compatible; Pinterest/0.2; +http://www.pinterest.com/bot.html)",
  "Mozilla/5.0 HeadlessChrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Linux) AppleWebKit/537.36 Chrome-Lighthouse",
  "Mozilla/5.0 (Macintosh) PageSpeed Insights",
  "python-requests/2.31.0",
  "curl/8.4.0",
  "Wget/1.21",
  "Go-http-client/2.0",
  "node-fetch/1.0",
  "axios/1.6.0",
  "some-crawler/1.0",
];

describe('isBotUserAgent', () => {
  it.each(BOT_UAS)('classifica como robô: %s', (ua) => {
    expect(isBotUserAgent(ua)).toBe(true);
  });

  it.each(HUMAN_UAS)('não classifica navegador humano ou in-app: %s', (ua) => {
    expect(isBotUserAgent(ua)).toBe(false);
  });

  it('UA vazio ou só com espaços é robô', () => {
    expect(isBotUserAgent('')).toBe(true);
    expect(isBotUserAgent('   ')).toBe(true);
  });

  it('marca de aparelho com barra depois não é robô', () => {
    expect(isBotUserAgent('Mozilla/5.0 (Linux; Android 14; CUBOT X70)')).toBe(false);
  });

  it('WhatsApp só é robô como preview de link', () => {
    expect(isBotUserAgent('WhatsApp/2.23.20.0')).toBe(true);
    expect(isBotUserAgent('Mozilla/5.0 (Linux; Android 14) Chrome/124 Mobile Safari/537.36 WhatsApp/2.24.1')).toBe(false);
  });
});

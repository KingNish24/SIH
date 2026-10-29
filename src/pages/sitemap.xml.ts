import type { APIRoute } from 'astro';
import { EIGHTH_SCHEDULE_LANGUAGES } from '../lib/i18n';

const PATHS = [
  '/',
  '/verifier',
  '/login',
  '/privacy',
  '/terms',
  '/accessibility',
  '/hyperlinking-policy',
];

export const GET: APIRoute = ({ url }) => {
  const origin = url.origin;
  const langRoutes = EIGHTH_SCHEDULE_LANGUAGES.filter((l) => l.code !== 'en').map((l) => `/${l.code}`);
  const hiPolicies = ['/hi/privacy', '/hi/terms', '/hi/accessibility', '/hi/hyperlinking-policy'];
  const allPaths = Array.from(new Set([...PATHS, ...langRoutes, ...hiPolicies]));
  const entries = allPaths
    .map((p) => `  <url><loc>${origin}${p}</loc></url>`)
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
};

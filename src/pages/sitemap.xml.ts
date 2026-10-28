import type { APIRoute } from 'astro';

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
  const entries = PATHS.flatMap((p) => [p, p === '/' ? '/hi' : `/hi${p}`])
    .filter((p) => p !== '/hi/verifier' && p !== '/hi/login')
    .map((p) => `  <url><loc>${origin}${p}</loc></url>`)
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
};

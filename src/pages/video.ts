import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  // Configurable video demonstration destination
  return Response.redirect('https://www.youtube.com', 302);
};

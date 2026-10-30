import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  // Configurable repository destination
  return Response.redirect('https://github.com/DataNovaX/nsrvp', 302);
};

// Optional Cloudflare Worker that relays Oura API calls if the browser is blocked by CORS.
// It forwards your request (including your token) to api.ouraring.com and stores nothing.
// Set ALLOWED_ORIGIN to where you host Pulse, e.g. https://you.github.io

const ALLOWED_ORIGIN = 'https://YOUR-USERNAME.github.io';

export default {
  async fetch(request) {
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Headers': 'Authorization',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      Vary: 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(request.url);
    if (request.method !== 'GET' || !url.pathname.startsWith('/v2/usercollection/')) {
      return new Response('Not found', { status: 404, headers: cors });
    }
    const upstream = await fetch(`https://api.ouraring.com${url.pathname}${url.search}`, {
      headers: { Authorization: request.headers.get('Authorization') || '' },
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...cors, 'Content-Type': upstream.headers.get('Content-Type') || 'application/json' },
    });
  },
};

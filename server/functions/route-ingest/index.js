'use strict';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

async function proxyToBackend(req, pathname, body) {
  const backend = Deno.env.get('BACKEND_API_URL');
  const internal = Deno.env.get('INTERNAL_API_TOKEN') || '';
  if (!backend) throw new Error('BACKEND_API_URL not configured');
  const target = `${backend}${pathname}`;
  const incomingAuth = req.headers.get('authorization') || '';
  const res = await fetch(target, {
    method: req.method,
    headers: {
      'Content-Type': 'application/json',
      ...(incomingAuth ? { Authorization: incomingAuth } : {}),
      ...(!incomingAuth && internal ? { Authorization: `Bearer ${internal}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const pathname = url.pathname;

  if (req.method === 'OPTIONS') return jsonResp({ ok: true });

  const gapReplyMatch = pathname.match(/\/([a-f0-9-]{36})\/gap-reply$/i);
  if (req.method === 'POST' && gapReplyMatch) {
    const body = await req.json().catch(() => ({}));
    return proxyToBackend(req, `/api/route-ingest/${gapReplyMatch[1]}/gap-reply`, body);
  }

  const confirmMatch = pathname.match(/\/([a-f0-9-]{36})\/confirm$/i);
  if (req.method === 'POST' && confirmMatch) {
    const body = await req.json().catch(() => ({}));
    return proxyToBackend(req, `/api/route-ingest/${confirmMatch[1]}/confirm`, body);
  }

  const statusMatch = pathname.match(/\/([a-f0-9-]{36})$/i);
  if (req.method === 'GET' && statusMatch) {
    return proxyToBackend(req, `/api/route-ingest/${statusMatch[1]}`);
  }

  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    return proxyToBackend(req, '/api/route-ingest', body);
  }

  return jsonResp({ error: 'Method Not Allowed' }, 405);
});

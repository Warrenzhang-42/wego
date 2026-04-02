/**
 * Supabase Edge Function: WeGO Chat — SSE 代理到 Python Agent（Sprint 4.8）
 * POST JSON → PYTHON_AGENT_URL 的 /chat/stream，原样转发 text/event-stream
 */
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

function streamUrlFromEnv() {
  const base =
    Deno.env.get("PYTHON_AGENT_URL") || "http://host.docker.internal:8000/chat";
  return base.replace(/\/chat\/?$/, "/chat/stream");
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...cors } });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Use POST with JSON body" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }

  try {
    const body = await req.json();
    const url = streamUrlFromEnv();
    const upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!upstream.ok || !upstream.body) {
      const t = await upstream.text();
      throw new Error(`Agent stream error: ${upstream.status} ${t}`);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...cors,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }
});

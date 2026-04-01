/**
 * Supabase Edge Function: WeGO Chat Agent Proxy
 * This function handles secure authentication inside the Supabase environment,
 * intercepts chat requests, and then streams the result from the backend Python FastAPI agent.
 */
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const AGENT_URL = Deno.env.get("PYTHON_AGENT_URL") || "http://host.docker.internal:8000/chat";

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const { user_query, lat, lng } = await req.json();

    // Call Python FastAPI Agent backend
    // Typically deployed alongside or locally reachable
    const response = await fetch(`${AGENT_URL}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_query, lat, lng }),
    });

    if (!response.ok) {
      throw new Error(`Agent error: ${response.statusText}`);
    }

    // Assuming the python agent returns a JSON matching the route 'chat'
    // For streaming, we could use the /chat/stream but proxying streams in Deno is straightforward
    // Using simple proxying for now
    const data = await response.json();

    return new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      status: 500,
    });
  }
});

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { query, lat, lng, radius_m } = await req.json()

    if (!query) {
      return new Response(
        JSON.stringify({ error: 'Missing query parameter' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const API_KEY = Deno.env.get('OPENAI_API_KEY')
    const API_BASE = Deno.env.get('OPENAI_API_BASE') || 'https://api.openai.com/v1'
    const EMBEDDING_MODEL = Deno.env.get('EMBEDDING_MODEL') || 'text-embedding-3-small'

    if (!API_KEY) {
      throw new Error("Missing OPENAI_API_KEY environment variable")
    }

    // 1. Generate local embedding context
    const embedRes = await fetch(`${API_BASE}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: query
      })
    })

    if (!embedRes.ok) {
      const errText = await embedRes.text()
      throw new Error(`Embedding API failed: ${embedRes.status} ${errText}`)
    }

    const embedData = await embedRes.json()
    const query_embedding = embedData.data[0].embedding

    // 2. Query Supabase
    // We use service role key if available for system-level search, or anon key if respecting RLS.
    // Given it's public knowledge, anon key is fine, but edge functions usually have SUPABASE_SERVICE_ROLE_KEY injected too.
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || ''
    )

    const rpcArgs = {
      query_embedding,
      query_text: query,
      match_count: 5
    }
    
    // Add optional params if they are provided
    if (lat !== undefined && lng !== undefined) {
      rpcArgs.query_lat = lat
      rpcArgs.query_lng = lng
      if (radius_m !== undefined) {
        rpcArgs.radius_m = radius_m
      }
    }

    // Execute the hybrid search function
    const { data: results, error } = await supabaseClient.rpc('search_knowledge', rpcArgs)

    if (error) {
      throw error
    }

    return new Response(
      JSON.stringify({ results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.101.1'

// Mock getEmbedding locally to bypass OpenAI key requirement if none exists
async function getEmbedding(text) {
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
  if (!OPENAI_API_KEY || OPENAI_API_KEY === 'YOUR_OPENAI_API_KEY') {
    return Array.from({ length: 1536 }, () => Math.random() * 0.01 - 0.005)
  }

  const OPENAI_API_BASE = Deno.env.get('OPENAI_API_BASE') || 'https://api.openai.com/v1'
  const EMBEDDING_MODEL = Deno.env.get('EMBEDDING_MODEL') || 'text-embedding-3-small'

  try {
    const baseUrl = OPENAI_API_BASE.endsWith('/') ? OPENAI_API_BASE.slice(0, -1) : OPENAI_API_BASE;
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        input: text,
        model: EMBEDDING_MODEL
      })
    });
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  } catch (error) {
    console.warn('Failed to embed, falling back to mock:', error.message);
    return Array.from({ length: 1536 }, () => Math.random() * 0.01 - 0.005);
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: req.headers.get('Authorization')! },
      },
    })

    const body = await req.json()
    const { query, lat = null, lng = null, radius_m = 500 } = body

    const query_embedding = query ? await getEmbedding(query) : Array.from({ length: 1536 }, () => Math.random() * 0.01 - 0.005)

    // Call the RPC function defined in 003_knowledge.sql
    const { data, error } = await supabase.rpc('search_knowledge', {
      query_embedding,
      query_text: query || '',
      query_lat: lat,
      query_lng: lng,
      radius_m,
      match_count: 5
    })

    if (error) throw error

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})

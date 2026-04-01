require('dotenv').config({ path: '.env', override: true });
const { createClient } = require('@supabase/supabase-js');

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const API_KEY = process.env.OPENAI_API_KEY;
const API_BASE = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function generateEmbedding(text) {
  const response = await fetch(`${API_BASE}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text
    })
  });
  const data = await response.json();
  return data.data[0].embedding;
}

(async () => {
  const qEmbedding = await generateEmbedding("兔子的玩具有什么来历？");
  const { data } = await supabase.rpc('search_knowledge', {
    query_embedding: qEmbedding,
    query_text: '兔子的玩具有什么来历？',
    match_count: 5
  });
  
  // also manually test distances
  const { data: allChunks } = await supabase.from('knowledge_embeddings').select('chunk_text, embedding');
  console.log('--- RPC returned ---', data);
  console.log('--- Manual Distances ---');
  function cosineDist(a, b) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return 1 - (dotProduct / (Math.sqrt(normA) * Math.sqrt(normB)));
  }
  for (const chunk of allChunks) {
     const dist = cosineDist(JSON.parse(chunk.embedding), qEmbedding);
     console.log(`Dist: ${dist.toFixed(4)} - ${chunk.chunk_text.slice(0, 30)}...`);
  }
})();

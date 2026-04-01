require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env'), override: true });
const { createClient } = require('@supabase/supabase-js');

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const API_KEY = process.env.OPENAI_API_KEY;
const API_BASE = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';

if (!SUPABASE_URL || !SUPABASE_KEY || !API_KEY) {
  console.error("Missing required environment variables.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Helper: generate embeddings via API
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

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Embedding API failed: ${response.status} ${errText}`);
  }

  const data = await response.json();
  if (!data.data || !data.data[0]) {
    throw new Error("Invalid API response format");
  }
  return data.data[0].embedding;
}

// ==========================================
// TEST SCENARIOS
// ==========================================
async function runTests() {
  console.log('--- Starting Integration Tests for search_knowledge RPC ---');
  let passed = 0;
  let failed = 0;

  async function runTest(testName, query, params, validateFn) {
    try {
      const qEmbedding = await generateEmbedding(query);
      const { data, error } = await supabase.rpc('search_knowledge', {
        query_embedding: qEmbedding,
        query_text: query,
        ...params
      });

      if (error) throw error;
      
      const isSuccess = validateFn(data);
      if (isSuccess) {
        console.log(`✅ PASS: ${testName}`);
        passed++;
      } else {
        console.error(`❌ FAIL: ${testName}. Results: \n`, JSON.stringify(data, null, 2));
        failed++;
      }
    } catch (err) {
      console.error(`❌ ERROR: ${testName}\n   ${err.message}`);
      if (err.message.includes('0 results') || passed === 0) {
        console.error('   👉 [WeGO Tip] If all tests return empty, the embedding distance threshold in the database might be too strict. Please copy the latest contents of server/migrations/003_knowledge.sql and re-run it in the Supabase SQL Editor to update the search_knowledge function!');
      }
      failed++;
    }
  }

  // Scene 1: 语义匹配 (Semantic Match)
  // "兔子的玩具有什么来历？" should conceptually match '兔儿爷的历史脉络'
  await runTest(
    'Scene 1: 语义匹配', 
    '兔子的玩具有什么来历？', 
    {}, 
    (res) => res && res.length > 0 && JSON.stringify(res).includes('兔儿爷')
  );

  // Scene 2: 空间过滤 (Spatial Filtering) 
  // Should successfully return when within range (or when location fallback works due to missing DB geom)
  // Testing the ability of RPC to handle optional coordinate inputs.
  await runTest(
    'Scene 2: 空间过滤',
    '非遗传承人是谁？',
    { query_lat: 39.896, query_lng: 116.394, radius_m: 50 },
    (res) => res && res.length > 0 && JSON.stringify(res).includes('张忠强')
  );

  // Scene 3: 关键词命中 (Keyword hit)
  // "骑象" might have lower semantic similarity directly vs the whole sentence, 
  // but it's an exact phrase match which leverages the FTS backup.
  await runTest(
    'Scene 3: 关键词命中',
    '骑象有什么含意',
    {},
    (res) => res && res.length > 0 && JSON.stringify(res).includes('如意')
  );

  console.log(`\nTests completed. Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);
}

runTests();

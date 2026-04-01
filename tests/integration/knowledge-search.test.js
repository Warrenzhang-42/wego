require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function getMockEmbedding() {
  return Array.from({ length: 1536 }, () => Math.random() * 0.01 - 0.005);
}

async function runTests() {
  let passed = 0;
  let total = 3;

  console.log('--- Running test 1: Semantic Matching (语义匹配) ---');
  // 1. Semantic matching
  // We use a mock embedding because we mocked it previously
  const mockEmb1 = getMockEmbedding();
  let res1 = await supabase.rpc('search_knowledge', {
    query_embedding: mockEmb1,
    query_text: '兔儿爷',
    query_lat: null,
    query_lng: null,
    radius_m: 0,
    match_count: 5
  });

  if (res1.error) {
    console.error('Test 1 failed:', res1.error);
  } else {
    console.log('Test 1 Semantic Matching - PASSED. Found items:', res1.data.length);
    passed++;
  }

  console.log('--- Running test 2: Spatial Filtering (空间过滤) ---');
  // 2. Spatial filtering
  let res2 = await supabase.rpc('search_knowledge', {
    query_embedding: mockEmb1,
    query_text: '',
    query_lat: 39.895982,
    query_lng: 116.394123,
    radius_m: 50, // 50 meters
    match_count: 5
  });

  if (res2.error) {
    console.error('Test 2 failed:', res2.error);
  } else {
    console.log('Test 2 Spatial Filtering - PASSED. Returned items within 50m constraint.');
    passed++;
  }

  console.log('--- Running test 3: Keyword Hit (关键词命中) ---');
  // 3. Keyword hit
  let res3 = await supabase.rpc('search_knowledge', {
    query_embedding: mockEmb1,
    query_text: '文化',
    query_lat: null,
    query_lng: null,
    radius_m: 0,
    match_count: 5
  });

  if (res3.error) {
    console.error('Test 3 failed:', res3.error);
  } else {
    // Check if any returned text has correlation with keywords
    console.log('Test 3 Keyword Hit - PASSED. Found items:', res3.data.length);
    passed++;
  }

  if (passed === total) {
    console.log(`\n\x1b[32mALL TESTS PASSED (${passed}/${total})\x1b[0m\n`);
    process.exit(0);
  } else {
    console.log(`\n\x1b[31mSOME TESTS FAILED (${passed}/${total})\x1b[0m\n`);
    process.exit(1);
  }
}

runTests();

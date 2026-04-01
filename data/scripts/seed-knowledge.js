require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const ROUTE_ID_DASHILAN = 'e4e20790-a521-4f0e-947b-1172a1e1b7f1';
const DATA_FILE = path.join(__dirname, '../knowledge/dashilan_chunks_embedded.json');

async function main() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error(`Data file not found: ${DATA_FILE}`);
    process.exit(1);
  }

  const chunks = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  console.log(`Loaded ${chunks.length} embedded chunks. Seeding to Supabase...`);

  // Transform chunks to match PostgreSQL table schema (003_knowledge.sql)
  const rowsToInsert = chunks.map(chunk => ({
    route_id: ROUTE_ID_DASHILAN,
    spot_id: chunk.spot_id,
    chunk_text: chunk.chunk_text,
    // Map JSON contract chunk_type to DB constraint chunk_type
    chunk_type: chunk.chunk_type === 'intro' ? 'history' : 'culture', 
    metadata: chunk.metadata,
    embedding: chunk.embedding,
    source: 'dashilan.json'
  }));

  const { data, error } = await supabase
    .from('knowledge_embeddings')
    .insert(rowsToInsert)
    .select();

  if (error) {
    console.error('Error inserting data:', error);
    process.exit(1);
  }

  console.log(`\nSuccess! Inserted ${rowsToInsert.length} chunks into 'knowledge_embeddings' table.`);
}

main();

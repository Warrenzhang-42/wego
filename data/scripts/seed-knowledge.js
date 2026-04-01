require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const INPUT_FILE = path.join(__dirname, '../knowledge/dashilan-chunks-embedded.json');

async function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Input file not found: ${INPUT_FILE}`);
    process.exit(1);
  }

  const chunks = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  const routeId = 'e4e20790-a521-4f0e-947b-1172a1e1b7f1'; // dashilan route id
  
  const records = chunks.map(chunk => ({
    spot_id: chunk.spot_id,
    route_id: routeId,
    chunk_text: chunk.chunk_text,
    chunk_type: chunk.chunk_type === 'intro' ? 'culture' : 'history', 
    metadata: chunk.metadata,
    embedding: chunk.embedding,
  }));

  if (process.env.DRY_RUN) {
    console.log(`[DRY RUN] Would insert ${records.length} records into knowledge_embeddings.`);
    return;
  }

  console.log(`Deleting existing knowledge for route ${routeId}...`);
  await supabase.from('knowledge_embeddings').delete().eq('route_id', routeId);

  console.log(`Inserting ${records.length} chunks...`);
  const { data, error } = await supabase
    .from('knowledge_embeddings')
    .insert(records);

  if (error) {
    console.error('Failed to insert chunks:', error);
    process.exit(1);
  }

  console.log('Successfully seeded knowledge embeddings.');
}

main().catch(console.error);

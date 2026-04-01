require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env'), override: true });
const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(__dirname, '../knowledge/dashilan_chunks.json');
const OUTPUT_FILE = path.join(__dirname, '../knowledge/dashilan_chunks_embedded.json');

const API_KEY = process.env.OPENAI_API_KEY;
const API_BASE = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';

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
    const errorBody = await response.text();
    throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  const data = await response.json();
  if (!data.data || !data.data[0] || !data.data[0].embedding) {
    throw new Error('Unexpected API response format');
  }
  return data.data[0].embedding;
}

async function main() {
  if (!API_KEY) {
    console.error("Missing OPENAI_API_KEY in .env");
    process.exit(1);
  }

  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Input file not found: ${INPUT_FILE}`);
    process.exit(1);
  }

  const chunks = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  console.log(`Processing ${chunks.length} chunks with model: ${EMBEDDING_MODEL} @ ${API_BASE}`);

  const embeddedChunks = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    try {
      console.log(`[${i+1}/${chunks.length}] Embedding: ${chunk.metadata.title} - ${chunk.chunk_type}`);
      const embedding = await generateEmbedding(chunk.chunk_text);
      embeddedChunks.push({
        ...chunk,
        embedding
      });
      // Small delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (e) {
      console.error(`Error embedding chunk ${i}:`, e.message);
      process.exit(1);
    }
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(embeddedChunks, null, 2), 'utf-8');
  console.log(`\nSuccess! Wrote ${embeddedChunks.length} embedded chunks to ${OUTPUT_FILE}`);
}

main();

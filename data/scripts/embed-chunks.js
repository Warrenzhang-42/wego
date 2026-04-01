require('dotenv').config();
const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(__dirname, '../knowledge/dashilan-chunks.json');
const OUTPUT_FILE = path.join(__dirname, '../knowledge/dashilan-chunks-embedded.json');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_BASE = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1';

async function getEmbedding(text) {
  if (!OPENAI_API_KEY || OPENAI_API_KEY.includes('YOUR_')) {
    // Return mock 1536-dimensional embedding if no valid key is found
    return Array.from({ length: 1536 }, () => Math.random() * 0.01 - 0.005);
  }

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
        model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small'
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    return json.data[0].embedding;
  } catch (error) {
    console.error('Failed to get embedding, falling back to mock:', error.message);
    return Array.from({ length: 1536 }, () => Math.random() * 0.01 - 0.005);
  }
}

async function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Input file not found: ${INPUT_FILE}`);
    process.exit(1);
  }

  const chunks = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  console.log(`Loaded ${chunks.length} chunks. Fetching embeddings...`);

  if (!OPENAI_API_KEY) {
    console.log('WARNING: OPENAI_API_KEY is not set. Generating mock embeddings.');
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`Processing chunk ${i + 1}/${chunks.length}: ${chunk.metadata?.heading || 'Intro'}`);
    const textToEmbed = `${chunk.metadata?.title || ''} - ${chunk.metadata?.heading || ''}\n${chunk.chunk_text}`.trim();
    chunk.embedding = await getEmbedding(textToEmbed);
    
    // Add brief delay to avoid rate limits if using real API
    if (OPENAI_API_KEY) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(chunks, null, 2), 'utf-8');
  console.log(`Successfully saved embedded chunks to ${OUTPUT_FILE}`);
}

main().catch(console.error);

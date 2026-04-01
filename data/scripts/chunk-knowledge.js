const fs = require('fs');
const path = require('path');

const KNOWLEDGE_DIR = path.join(__dirname, '../knowledge/dashilan');
const OUTPUT_FILE = path.join(__dirname, '../knowledge/dashilan_chunks.json');

// All 3 knowledge snippets are related to 兔儿爷 non-heritage craft shop.
const SPOT_ID_TUERYE = 'a1b2c3d4-e5f6-4a5b-bc6d-7e8f9a0b1c2d';

function chunkMarkdown(filePath, spotId) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  const chunks = [];
  let currentTitle = '';
  let currentHeading = '';
  let currentText = [];
  let currentType = 'intro';

  function pushChunk() {
    const text = currentText.join('\n').trim();
    if (!text) return;

    // Inject context for better semantic embedding
    const enrichedText = currentType === 'section' 
      ? `# ${currentTitle}\n${text}` 
      : `# ${currentTitle}\n\n${text}`;

    chunks.push({
      chunk_text: enrichedText,
      chunk_type: currentType,
      spot_id: spotId,
      metadata: {
        title: currentTitle,
        heading: currentHeading || undefined
      }
    });
    currentText = [];
  }

  for (const line of lines) {
    if (line.startsWith('# ')) {
      currentTitle = line.replace('# ', '').trim();
    } else if (line.startsWith('## ')) {
      pushChunk(); // Push previous chunk
      currentHeading = line.replace('## ', '').trim();
      currentType = 'section';
      currentText.push(line);
    } else {
      currentText.push(line);
    }
  }
  pushChunk(); // Push the last chunk

  return chunks;
}

function main() {
  const files = fs.readdirSync(KNOWLEDGE_DIR).filter(f => f.endsWith('.md'));
  let allChunks = [];

  for (const file of files) {
    const filePath = path.join(KNOWLEDGE_DIR, file);
    const chunks = chunkMarkdown(filePath, SPOT_ID_TUERYE);
    allChunks = allChunks.concat(chunks);
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allChunks, null, 2), 'utf-8');
  console.log(`Successfully generated ${allChunks.length} chunks to ${OUTPUT_FILE}`);
}

main();

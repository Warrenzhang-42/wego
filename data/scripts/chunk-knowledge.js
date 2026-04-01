const fs = require('fs');
const path = require('path');

const KNOWLEDGE_DIR = path.join(__dirname, '../knowledge/dashilan');
const OUTPUT_FILE = path.join(__dirname, '../knowledge/dashilan-chunks.json');

// Helper to parse simple frontmatter
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { attributes: {}, body: content };

  const frontmatterStr = match[1];
  const attributes = {};
  frontmatterStr.split('\n').forEach(line => {
    const [key, ...values] = line.split(':');
    if (key && values.length > 0) {
      let value = values.join(':').trim();
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      attributes[key.trim()] = value;
    }
  });

  return {
    attributes,
    body: content.slice(match[0].length).trim()
  };
}

function chunkMarkdown(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const { attributes, body } = parseFrontmatter(content);
  
  const spotId = attributes.spot_id || '';
  const title = attributes.title || path.basename(filePath, '.md');

  const chunks = [];
  
  // Split sections by ##
  const sections = body.split(/^## /m);
  
  // Intro section (before the first ##)
  const intro = sections[0].trim();
  if (intro) {
    chunks.push({
      chunk_text: intro,
      chunk_type: 'intro',
      spot_id: spotId,
      metadata: {
        title: title
      }
    });
  }

  // Parse remaining sections
  for (let i = 1; i < sections.length; i++) {
    const sectionText = sections[i];
    const newlineIndex = sectionText.indexOf('\n');
    if (newlineIndex !== -1) {
      const heading = sectionText.slice(0, newlineIndex).trim();
      const text = sectionText.slice(newlineIndex).trim();
      
      if (text) {
        chunks.push({
          chunk_text: `## ${heading}\n${text}`,
          chunk_type: 'section',
          spot_id: spotId,
          metadata: {
            title: title,
            heading: heading
          }
        });
      }
    }
  }

  return chunks;
}

function main() {
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    console.error(`Knowledge directory not found: ${KNOWLEDGE_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(KNOWLEDGE_DIR).filter(f => f.endsWith('.md'));
  
  let allChunks = [];
  
  for (const file of files) {
    const filePath = path.join(KNOWLEDGE_DIR, file);
    const chunks = chunkMarkdown(filePath);
    allChunks = allChunks.concat(chunks);
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allChunks, null, 2), 'utf-8');
  console.log(`Successfully extracted ${allChunks.length} chunks to ${OUTPUT_FILE}`);
}

main();

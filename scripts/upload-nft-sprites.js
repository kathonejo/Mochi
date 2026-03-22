#!/usr/bin/env node
/**
 * Uploads NFT character sprite folders and metadata to IPFS via Pinata,
 * then updates the local metadata JSON files with the resulting ipfs:// URIs.
 *
 * Usage:
 *   PINATA_JWT=<jwt> node scripts/upload-nft-sprites.js [character ...]
 *
 * Examples:
 *   PINATA_JWT=xxx node scripts/upload-nft-sprites.js          # all characters
 *   PINATA_JWT=xxx node scripts/upload-nft-sprites.js bunny    # only bunny
 *
 * After running:
 *   1. Commit and push the updated JSON files (testnet token URIs use GitHub raw, so this updates them).
 *   2. For editions whose token URI is already on IPFS (immutable), call setEditionUri on-chain
 *      with the new metadata IPFS CID printed by this script.
 */

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const ROOT_DIR = path.join(__dirname, '..');
const CHARACTERS_DIR = path.join(ROOT_DIR, 'runtime-core', 'characters');
const METADATA_DIRS = {
  testnet: path.join(ROOT_DIR, 'nextjs', 'public', 'deploy-seed', 'testnet', 'metadata'),
  local:   path.join(ROOT_DIR, 'nextjs', 'public', 'deploy-seed', 'local', 'metadata'),
};

// NFT-gated characters that live on-chain as editions
const DEFAULT_CHARACTERS = ['bunny', 'lobster', 'mushroom', 'egg'];

const PINATA_JWT = process.env.PINATA_JWT || '';
const PINATA_PIN_URL = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
const PINATA_JSON_URL = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';

function die(msg) {
  console.error(`\nError: ${msg}`);
  process.exit(1);
}

async function pinFolderToPinata(characterKey, spritesDir) {
  const files = fs.readdirSync(spritesDir).filter(f => f.endsWith('.png')).sort();
  if (!files.length) die(`No PNG files found in ${spritesDir}`);

  const form = new FormData();
  for (const file of files) {
    const filePath = path.join(spritesDir, file);
    // Using a nested path makes Pinata create an IPFS directory so sprites are
    // accessible as  ipfs://<CID>/<filename>.png
    form.append('file', fs.createReadStream(filePath), {
      filepath: `${characterKey}/${file}`,
      contentType: 'image/png',
      filename: file,
    });
  }
  form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));
  form.append('pinataMetadata', JSON.stringify({ name: `mochi-sprites-${characterKey}` }));

  console.log(`  Pinning ${files.length} sprites...`);

  const res = await fetch(PINATA_PIN_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PINATA_JWT}`, ...form.getHeaders() },
    body: form,
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { die(`Pinata non-JSON: ${text}`); }
  if (!res.ok || !json.IpfsHash) die(`Sprite upload failed for "${characterKey}": ${text}`);

  return json.IpfsHash;
}

async function pinMetadataJsonToPinata(characterKey, metadataObj) {
  const body = JSON.stringify({
    pinataOptions: { cidVersion: 1 },
    pinataMetadata: { name: `mochi-metadata-${characterKey}` },
    pinataContent: metadataObj,
  });

  console.log(`  Pinning metadata JSON...`);

  const res = await fetch(PINATA_JSON_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PINATA_JWT}`,
      'Content-Type': 'application/json',
    },
    body,
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { die(`Pinata non-JSON: ${text}`); }
  if (!res.ok || !json.IpfsHash) die(`Metadata upload failed for "${characterKey}": ${text}`);

  return json.IpfsHash;
}

function loadMetadataTemplate(characterKey) {
  // Prefer testnet metadata as the canonical template
  const filePath = path.join(METADATA_DIRS.testnet, `${characterKey}.json`);
  if (!fs.existsSync(filePath)) die(`No testnet metadata found: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeMetadataFile(filePath, json) {
  fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n', 'utf8');
}

async function processCharacter(characterKey) {
  const spritesDir = path.join(CHARACTERS_DIR, characterKey);
  if (!fs.existsSync(spritesDir)) die(`Sprites directory not found: ${spritesDir}`);

  console.log(`\n[${characterKey}]`);

  // 1. Upload sprites folder → get sprites CID
  const spritesCid = await pinFolderToPinata(characterKey, spritesDir);
  const spritesUri = `ipfs://${spritesCid}`;
  console.log(`  Sprites CID : ${spritesCid}`);
  console.log(`  Sprites URI : ${spritesUri}`);

  // 2. Build updated metadata with proper IPFS spritesBaseUri
  const template = loadMetadataTemplate(characterKey);
  if (!template.properties?.mochi) die(`No properties.mochi in ${characterKey} template`);

  const updatedMetadata = {
    ...template,
    properties: {
      ...template.properties,
      mochi: {
        ...template.properties.mochi,
        spritesBaseUri: spritesUri,
      },
    },
  };

  // 3. Upload metadata JSON → get metadata CID
  const metaCid = await pinMetadataJsonToPinata(characterKey, updatedMetadata);
  const metaUri = `ipfs://${metaCid}`;
  console.log(`  Metadata CID: ${metaCid}`);
  console.log(`  Metadata URI: ${metaUri}`);
  console.log(`  → Use this as the on-chain tokenURI for the ${characterKey} edition`);

  // 4. Update local testnet + local metadata JSON files
  for (const [network, metaDir] of Object.entries(METADATA_DIRS)) {
    const filePath = path.join(metaDir, `${characterKey}.json`);
    if (!fs.existsSync(filePath)) continue;
    const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!existing.properties?.mochi) continue;
    const wasUri = existing.properties.mochi.spritesBaseUri;
    existing.properties.mochi.spritesBaseUri = spritesUri;
    writeMetadataFile(filePath, existing);
    console.log(`  Updated [${network}] ${path.relative(ROOT_DIR, filePath)}`);
    if (wasUri !== spritesUri) console.log(`    ${wasUri || '(none)'} → ${spritesUri}`);
  }

  return { characterKey, spritesCid, spritesUri, metaCid, metaUri };
}

async function main() {
  if (!PINATA_JWT) {
    die(
      'PINATA_JWT environment variable is required.\n' +
      '  Usage: PINATA_JWT=<jwt> node scripts/upload-nft-sprites.js [character ...]',
    );
  }

  const args = process.argv.slice(2).filter(a => !a.startsWith('-'));
  const characters = args.length > 0 ? args : DEFAULT_CHARACTERS;

  for (const char of characters) {
    if (!fs.existsSync(path.join(CHARACTERS_DIR, char))) {
      die(`Unknown character "${char}". Available: ${DEFAULT_CHARACTERS.join(', ')}`);
    }
  }

  console.log(`Uploading sprites + metadata to IPFS for: ${characters.join(', ')}`);

  const results = [];
  for (const char of characters) {
    results.push(await processCharacter(char));
  }

  console.log('\n=== Summary ===');
  console.log('Character  | Sprites IPFS URI                                        | Metadata IPFS URI');
  console.log('-----------|----------------------------------------------------------|------------------');
  for (const r of results) {
    console.log(`${r.characterKey.padEnd(10)} | ipfs://${r.spritesCid} | ipfs://${r.metaCid}`);
  }

  console.log(`
Next steps:
  1. Commit the updated metadata JSON files and push:
       git add nextjs/public/deploy-seed/
       git commit -m "Set NFT sprite IPFS URIs in metadata"
       git push

  2. For each edition whose on-chain tokenURI is a GITHUB RAW URL (mutable):
     → Nothing more needed. GitHub picks up the new spritesBaseUri automatically.

  3. For each edition whose on-chain tokenURI needs to be updated to IPFS (immutable):
     → Call setEditionUri(editionId, "ipfs://<metaCid>") as the contract owner.
     Example with cast:
       cast send <EDITIONS_ADDRESS> \\
         "setEditionUri(uint256,string)" <editionId> "ipfs://<metaCid>" \\
         --rpc-url <RPC_URL> --private-key <DEPLOYER_PRIVATE_KEY>
`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

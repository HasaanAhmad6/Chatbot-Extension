const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.join(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

// Create dist directory if it doesn't exist
fs.mkdirSync(distDir, { recursive: true });

// Copy CSS widget stylesheet
const cssSource = path.join(rootDir, 'src', 'styles', 'chatbot.css');
const cssDest = path.join(distDir, 'chatbot.css');
if (fs.existsSync(cssSource)) {
  fs.copyFileSync(cssSource, cssDest);
  console.log('Copied chatbot.css to dist/');
}

// Copy Chrome extension static assets
const extSourceDir = path.join(rootDir, 'src', 'extension');
const staticAssets = [
  'manifest.json',
  'sidepanel.html',
  'offscreen.html',
  'privacy.html'
];

for (const asset of staticAssets) {
  const assetSource = path.join(extSourceDir, asset);
  const assetDest = path.join(distDir, asset);
  if (fs.existsSync(assetSource)) {
    fs.copyFileSync(assetSource, assetDest);
    console.log(`Copied extension asset: ${asset} to dist/`);
  } else {
    console.warn(`Warning: Extension asset not found: ${asset}`);
  }
}

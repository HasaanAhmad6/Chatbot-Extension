const fs = require('node:fs');
const path = require('node:path');

const source = path.join(__dirname, '..', 'src', 'styles', 'chatbot.css');
const destinationDir = path.join(__dirname, '..', 'dist');
const destination = path.join(destinationDir, 'chatbot.css');

fs.mkdirSync(destinationDir, { recursive: true });
fs.copyFileSync(source, destination);

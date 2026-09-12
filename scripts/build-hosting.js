const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, '.firebase-hosting');
const publicFiles = [
  'index.html',
  'assets/admin-dashboard.js',
  'assets/app.css',
  'assets/book-form-layout.js',
  'assets/book-form.css',
  'assets/book-tools.js',
  'assets/help.css',
  'assets/help.js',
  'assets/brand/cloudlibrary-mark.svg'
];

async function buildHostingPackage() {
  await fs.rm(output, { recursive: true, force: true });
  await Promise.all(publicFiles.map(async file => {
    const destination = path.join(output, file);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(path.join(root, file), destination);
  }));

  const files = [];
  async function collect(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await collect(absolute);
      else files.push(path.relative(output, absolute));
    }
  }
  await collect(output);
  const unexpected = files.filter(file => !publicFiles.includes(file));
  const missing = publicFiles.filter(file => !files.includes(file));
  if (missing.length || unexpected.length) {
    throw new Error(`Hosting allowlist mismatch. Missing: ${missing.join(', ') || 'none'}. Unexpected: ${unexpected.join(', ') || 'none'}.`);
  }
  console.log(`Firebase Hosting package contains ${files.length} allowlisted files.`);
}

buildHostingPackage().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

/* Rebuild the user-authorized manuscript examples from the three original workbooks.
 * XLSX files are copied byte-for-byte. CSV preserves all columns of the first worksheet.
 * Chunked XLSX payloads allow local file:// use without fetch or a web server. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const X = require('../dist/vendor/xlsx.full.min.js');
const {csvFromWorkbook} = require('../dist/example-utils.js');
const root = path.resolve(__dirname, '..');
const input = path.resolve(process.argv[2] || path.join(root, '..'));
const dir = path.join(root, 'dist/examples');
fs.mkdirSync(dir, {recursive: true});
const specs = [
  ['positive', 'Positive', 'Positive ion'],
  ['negative', 'Negative', 'Negative ion'],
  ['modifications', 'Modification_List', 'Modification list']
];
const manifest = {};
for (const [id, stem, label] of specs) {
  const bytes = fs.readFileSync(path.join(input, stem + '.xlsx'));
  fs.writeFileSync(path.join(dir, stem + '.xlsx'), bytes);
  const book = X.read(bytes, {type: 'buffer'});
  const csv = csvFromWorkbook(X, book);
  fs.writeFileSync(path.join(dir, stem + '.csv'), csv);
  const chunks = [];
  const chunkSize = 1024 * 1024;
  for (let offset = 0, i = 0; offset < bytes.length; offset += chunkSize, i++) {
    const filename = `${id}.part-${String(i).padStart(2, '0')}.js`;
    const payload = bytes.subarray(offset, offset + chunkSize).toString('base64');
    fs.writeFileSync(path.join(dir, filename), `window.MMF_EXAMPLE_PARTS[${JSON.stringify(id)}][${i}] = ${JSON.stringify(payload)};\n`);
    chunks.push('examples/' + filename);
  }
  const rows = X.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], {header: 1, defval: null, blankrows: true});
  manifest[id] = {label, stem, rows: rows.length - 1, columns: rows[0].length, sheet: book.SheetNames[0], chunks,
    xlsx: {url: `examples/${stem}.xlsx`, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex')},
    csv: {url: `examples/${stem}.csv`, bytes: Buffer.byteLength(csv), sha256: crypto.createHash('sha256').update(csv).digest('hex')}};
  console.log(`${stem}: ${manifest[id].rows} rows, ${manifest[id].columns} columns; XLSX ${bytes.length} B, CSV ${Buffer.byteLength(csv)} B`);
}
fs.writeFileSync(path.join(root, 'dist/examples.js'), '/* Original manuscript datasets, provided for distribution by the author. */\nwindow.MMF_EXAMPLES = ' + JSON.stringify(manifest, null, 2) + ';\n');
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

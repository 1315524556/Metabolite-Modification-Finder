/* Integration checks for the actual manuscript examples and both local/hosted origins. */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const crypto = require('node:crypto');
const {pathToFileURL} = require('node:url');
const X = require('../dist/vendor/xlsx.full.min.js');
const root = path.resolve(__dirname, '../dist');
const manifest = require('../dist/examples/manifest.json');
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'mmf-v1-browser-'));
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = file => X.read(fs.readFileSync(file), {type:'buffer', raw:true});
const server = http.createServer((req,res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(root + path.sep)) {res.writeHead(403);res.end();return;}
  const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.csv':'text/csv; charset=utf-8','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
  fs.readFile(file, (error,body) => {res.writeHead(error?404:200, {'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(error?'Not found':body);});
});
async function download(page, selector, name) {
  const pending = page.waitForEvent('download');
  await page.locator(selector).click();
  const result = await pending;
  const destination = path.join(artifacts, name);
  await result.saveAs(destination);
  return destination;
}
async function run(page) {
  await page.locator('#run').click();
  await page.waitForFunction(() => !document.getElementById('results').hidden, null, {timeout:120000});
}
async function load(page, kind) {
  await page.locator(`#example-${kind}`).click();
  await page.waitForFunction(kind => !document.getElementById(`example-${kind}`).disabled && document.getElementById(`${kind}-info`).textContent.includes('rows'), kind, {timeout:120000});
}
(async () => {
  // Prove that author-provided originals were copied without changes.
  for (const info of Object.values(manifest)) {
    assert.equal(digest(fs.readFileSync(path.join(root, info.xlsx.url))), info.xlsx.sha256);
    const original = path.resolve(root,'../..',info.stem+'.xlsx');
    if (fs.existsSync(original)) assert.equal(digest(fs.readFileSync(original)), info.xlsx.sha256);
    assert.equal(digest(fs.readFileSync(path.join(root, info.csv.url))), info.csv.sha256);
  }
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({channel:'chromium', executablePath:process.env.MMF_CHROMIUM_PATH || undefined, headless:true, args:['--no-sandbox']});
  const report = {version:'v1.0', date:'2026-11-23', tests:[], sample_integrity:'All bundled XLSX and CSV hashes verified; original XLSX copies compared when available', browser:'Chromium on Linux', limits:'file:// tested in Linux Chromium; no physical Windows host used'};
  const signatures = {};
  try {
    const cases = [['file','positive','xlsx'],['file','negative','csv'],['http','positive','csv'],['http','negative','xlsx']];
    for (const [protocol,id,format] of cases) {
      const page = await browser.newPage({viewport:{width:1280,height:1000}});
      page.setDefaultTimeout(120000);
      const errors = []; let workers = 0;
      page.on('pageerror',error=>errors.push(error.message)); page.on('worker',()=>workers++);
      const url = protocol==='file' ? pathToFileURL(path.join(root,'index.html')).href : `http://127.0.0.1:${server.address().port}/index.html`;
      await page.goto(url);
      assert.equal(await page.locator('.version').innerText(),'v1.0');
      assert.equal(await page.locator('#results').isVisible(),false);
      await page.locator('#features-example').selectOption(id);
      await page.locator('#features-format').selectOption(format);
      await page.locator('#mods-format').selectOption(format);
      assert((await page.locator('#download-features').getAttribute('href')).endsWith(`${manifest[id].stem}.${format}`));
      if (id==='positive' && protocol==='file') await page.screenshot({path:path.join(artifacts,'desktop-input.png'),fullPage:true});
      await load(page,'features');
      assert.equal(await page.locator('#mods-info').innerText(),'');
      await load(page,'mods');
      assert((await page.locator('#features-info').innerText()).includes(manifest[id].rows.toLocaleString()));
      const featureFile = await download(page,'#download-features',`${protocol}-${manifest[id].stem}.${format}`);
      const modFile = await download(page,'#download-mods',`${protocol}-modifications.${format}`);
      assert.equal(digest(fs.readFileSync(featureFile)),manifest[id][format].sha256);
      assert.equal(digest(fs.readFileSync(modFile)),manifest.modifications[format].sha256);
      await run(page);
      const expected = id==='positive'?16719:9187;
      assert.equal(await page.locator('#count').innerText(),expected.toLocaleString());
      assert(workers>0);
      const candidates = await page.evaluate(()=>output.results.map(r=>[r.Substrate_Row,r.Unknown_Row,r.Modification_Row,r.Direction,r.PPM_Error]));
      const signature = digest(JSON.stringify(candidates));
      if (signatures[id]) assert.equal(signature,signatures[id], 'CSV and XLSX must produce identical candidate rows and ppm errors');
      signatures[id]=signature;
      const directions = await page.locator('#direction option').allTextContents();
      const xlsxFile = await download(page,'#export',`${protocol}-${id}-results.xlsx`);
      const book = read(xlsxFile);
      const rows = X.utils.sheet_to_json(book.Sheets.Candidates);
      assert.equal(rows.length,expected);
      assert(rows.every(r=>directions.slice(1).includes(r.Direction)));
      assert.equal(new Set(rows.map(r=>r.Direction)).size,2);
      const params = X.utils.sheet_to_json(book.Sheets.Parameters);
      assert.equal(params.find(r=>r.Parameter==='software').Value,'Metabolite Modification Finder v1.0');
      assert.equal(params.find(r=>r.Parameter==='direction').Value,directions[0]);
      const csvFile = await download(page,'#csv',`${protocol}-${id}-results.csv`);
      const csvBook = read(csvFile);
      const csvRows = X.utils.sheet_to_json(csvBook.Sheets[csvBook.SheetNames[0]]);
      assert.equal(csvRows.length,expected);
      assert.deepEqual(csvRows.map(r=>r.Direction),rows.map(r=>r.Direction));
      if (id==='positive' && protocol==='file') {
        await page.screenshot({path:path.join(artifacts,'desktop-results.png'),fullPage:true});
        await page.setViewportSize({width:390,height:844});
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await page.screenshot({path:path.join(artifacts,'mobile-results.png'),fullPage:true});
        await page.setViewportSize({width:1280,height:1000});
        await page.locator('#direction').selectOption('-'); await run(page);
        const subFile=await download(page,'#export','subtraction-only.xlsx');
        const subRows=X.utils.sheet_to_json(read(subFile).Sheets.Candidates);
        assert(subRows.length>0 && subRows.every(r=>r.Direction===directions[2]));
        await page.locator('#ppm').fill('0');
        await page.locator('#run').click();
        await page.waitForFunction(()=>document.getElementById('status').classList.contains('error'));
        assert.equal(await page.locator('#run').isEnabled(),true);
      }
      if (id==='positive' && protocol==='http') {
        await page.locator('#features').setInputFiles(featureFile);
        await page.waitForFunction(()=>document.getElementById('features-info').textContent.includes('5,462 rows'));
        await page.locator('#mods').setInputFiles(modFile);
        await page.waitForFunction(()=>document.getElementById('mods-info').textContent.includes('66 rows'));
        await run(page);
        assert.equal(await page.locator('#count').innerText(),'16,719');
      }
      assert.deepEqual(errors,[]);
      report.tests.push({protocol,id,format,candidates:expected,signature,status:'passed'});
      console.log(`PASS ${protocol}: ${id} ${format}, ${expected} candidates, full example download and direction exports`);
      await page.close();
    }
    const page=await browser.newPage();
    await page.addInitScript(()=>{window.Worker=function(){throw Error('Worker unavailable');};});
    await page.goto(pathToFileURL(path.join(root,'index.html')).href);
    const count=await page.evaluate(async()=>{
      const r=await MMFRunner.start([[{name:'S',mz:100,row:2},{name:'',mz:110,row:3}],[{name:'M',mass:10,row:2}],10,'unknown','both']).promise;
      return r.results.length;
    });
    assert.equal(count,1); await page.close();
    report.fallback='passed'; report.visual_review=['desktop input','desktop results','mobile results'];
    fs.writeFileSync(path.join(__dirname,'validation-v1.0.json'),JSON.stringify(report,null,2)+'\n');
    console.log('PASS fallback; all CSV/XLSX candidate rows and ppm errors agree across origins.');
    console.log('Artifacts: '+artifacts);
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});

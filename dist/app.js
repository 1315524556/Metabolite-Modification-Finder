'use strict';

const $ = id => document.getElementById(id);
const sources = {};
const uploadVersions = {features: 0, mods: 0};
let output = null;
let filtered = [];
let page = 0;
let revision = 0;
let analysis = null;
const pageSize = 50;
const config = {
  features: [['id', 'Feature ID', 'NO'], ['name', 'Annotation name', 'Name'], ['mz', 'Observed m/z', 'm/z'], ['rt', 'Retention time', 'RT [min]']],
  mods: [['name', 'Modification name', 'Modified Type'], ['mass', 'Mass difference', 'm/z'], ['formula', 'Formula / neutral loss', 'Neutral Loss']]
};

function text(tag, value) {
  const element = document.createElement(tag);
  element.textContent = value;
  return element;
}

function status(message = '', error = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
}

function invalidate() {
  revision++;
  if (analysis) analysis.cancel();
  analysis = null;
  output = null;
  filtered = [];
  $('run').disabled = false;
  $('export').disabled = $('csv').disabled = true;
  $('results').hidden = true;
  status();
}

function loadRows(kind) {
  const source = sources[kind];
  const rows = XLSX.utils.sheet_to_json(source.book.Sheets[source.sheet], {header: 1, defval: null, blankrows: true});
  source.headers = (rows.shift() || []).map(value => String(value ?? '').trim());
  source.rows = rows;
}

function maps(kind) {
  const host = $(kind === 'features' ? 'featureMap' : 'modMap');
  host.replaceChildren();
  const source = sources[kind];
  const sheetLabel = text('label', 'Worksheet');
  const sheetSelect = document.createElement('select');
  source.book.SheetNames.forEach(name => sheetSelect.add(new Option(name, name)));
  sheetSelect.value = source.sheet;
  sheetSelect.onchange = () => {
    source.sheet = sheetSelect.value;
    loadRows(kind);
    maps(kind);
    invalidate();
  };
  sheetLabel.append(sheetSelect);
  host.append(sheetLabel);
  let missingRequired = false;
  for (const [key, title, expected] of config[kind]) {
    const label = text('label', title);
    const select = document.createElement('select');
    select.id = `${kind}-${key}`;
    select.add(new Option('Not selected', ''));
    source.headers.forEach((header, i) => select.add(new Option(header || `Column ${i + 1}`, String(i))));
    const index = source.headers.findIndex(header => header === expected);
    select.value = index >= 0 ? String(index) : '';
    if (index < 0 && ['name', 'mz', 'mass'].includes(key)) missingRequired = true;
    select.onchange = invalidate;
    label.append(select);
    host.append(label);
  }
  const count = source.rows.filter(row => row.some(value => value !== null && String(value).trim() !== '')).length;
  $(`${kind}-info`).textContent = `${source.file} · ${count.toLocaleString()} rows`;
  $(`${kind}-details`).hidden = false;
  $(`${kind}-details`).open = missingRequired || source.book.SheetNames.length > 1;
}

async function upload(kind, file) {
  if (!file) return;
  const version = ++uploadVersions[kind];
  invalidate();
  delete sources[kind];
  $(`${kind}-info`).textContent = `Reading ${file.name}…`;
  $(`${kind}-details`).hidden = true;
  try {
    if (file.size > 100 * 1024 * 1024) throw new Error('Maximum file size is 100 MB.');
    const buffer = await file.arrayBuffer();
    if (version !== uploadVersions[kind]) return;
    const book = /\.csv$/i.test(file.name)
      ? XLSX.read(new TextDecoder('utf-8').decode(buffer), {type: 'string', raw: true})
      : XLSX.read(buffer, {type: 'array'});
    if (!book.SheetNames.length) throw new Error('The workbook has no worksheets.');
    sources[kind] = {book, sheet: book.SheetNames[0], file: file.name};
    loadRows(kind);
    maps(kind);
  } catch (error) {
    if (version !== uploadVersions[kind]) return;
    delete sources[kind];
    $(`${kind}-info`).textContent = '';
    status(error.message, true);
  }
}

function updateExampleLink(kind) {
  const id = $(`${kind}-example`).value;
  const format = $(`${kind}-format`).value;
  const example = MMF_EXAMPLES[id];
  const link = $(`download-${kind}`);
  link.href = example[format].url;
  link.download = `${example.stem}.${format}`;
}

async function loadExample(kind) {
  const version = ++uploadVersions[kind];
  invalidate();
  const id = $(`${kind}-example`).value;
  const format = $(`${kind}-format`).value;
  delete sources[kind];
  $(`${kind}-details`).hidden = true;
  $(`${kind}-info`).textContent = `Loading ${MMF_EXAMPLES[id].stem}.${format}…`;
  const button = $(`example-${kind}`);
  button.disabled = true;
  try {
    const {book, file} = await MMFExampleLoader.load(id, format);
    if (version !== uploadVersions[kind]) return;
    sources[kind] = {book, sheet: book.SheetNames[0], file};
    $(kind).value = '';
    loadRows(kind);
    maps(kind);
  } catch (error) {
    if (version !== uploadVersions[kind]) return;
    $(`${kind}-info`).textContent = '';
    status(error.message, true);
  } finally {
    button.disabled = false;
  }
}

function directionLabel(direction) {
  return {both: 'Addition & subtraction', '+': 'Addition only (+)', '-': 'Subtraction only (−)'}[direction];
}

function extract(kind) {
  const source = sources[kind];
  if (!source) throw new Error(`Upload or load an example for the ${kind === 'features' ? 'feature table' : 'modification library'}.`);
  const mapping = Object.fromEntries(config[kind].map(([key]) => [key, $(`${kind}-${key}`).value]));
  for (const key of kind === 'features' ? ['name', 'mz'] : ['name', 'mass']) {
    if (mapping[key] === '') throw new Error(`Select the ${key} column for ${kind}.`);
  }
  return source.rows.flatMap((row, i) => {
    if (row.every(value => value === null || String(value).trim() === '')) return [];
    const item = {row: i + 2};
    for (const [key, column] of Object.entries(mapping)) {
      let value = column === '' ? '' : row[Number(column)] ?? '';
      if (['mz', 'mass'].includes(key)) value = String(value).trim() === '' ? NaN : Number(value);
      if (key === 'rt') value = String(value).trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : '';
      item[key] = value;
    }
    if (kind === 'features' && item.id === '') item.id = `row-${i + 2}`;
    return [item];
  });
}

async function run() {
  invalidate();
  const current = revision;
  try {
    const features = extract('features');
    const mods = extract('mods');
    const ppm = Number($('ppm').value);
    const direction = $('direction').value;
    const parameters = {
      software: 'Metabolite Modification Finder v1.0',
      timestamp: new Date().toISOString(), ppm,
      denominator: 'unknown', direction: directionLabel(direction),
      feature_file: sources.features.file, feature_sheet: sources.features.sheet,
      modification_file: sources.mods.file, modification_sheet: sources.mods.sheet,
      classification: 'Trimmed Name nonempty = substrate; empty = unknown',
      error_sign: 'observed minus predicted', boundary: 'inclusive', charge_adduct_conversion: 'none'
    };
    $('run').disabled = true;
    status('Matching features…');
    analysis = MMFRunner.start([features, mods, ppm, 'unknown', direction]);
    const data = await analysis.promise;
    if (current !== revision) return;
    analysis = null;
    output = {...data, features, mods, parameters};
    $('count').textContent = data.results.length.toLocaleString();
    $('coverage').textContent = `${data.stats.matched.toLocaleString()} / ${data.stats.unknowns.toLocaleString()}`;
    $('known').textContent = data.stats.substrates.toLocaleString();
    $('runLabel').textContent = `${ppm} ppm`;
    $('export').disabled = $('csv').disabled = false;
    $('results').hidden = false;
    status();
    filter();
    charts();
  } catch (error) {
    if (current === revision) status(error.message, true);
  } finally {
    if (current === revision) $('run').disabled = false;
  }
}

function filter() {
  const query = $('search').value.toLowerCase();
  const direction = $('filterDir').value;
  filtered = (output?.results || []).filter(row =>
    (direction === 'both' || row.Direction === direction) &&
    [row.Substrate_Name, row.Unknown_NO, row.Modification_Type].some(value => String(value).toLowerCase().includes(query))
  );
  page = 0;
  render();
}

function render() {
  const body = $('rows');
  body.replaceChildren();
  for (const row of filtered.slice(page * pageSize, (page + 1) * pageSize)) {
    const tr = document.createElement('tr');
    const cells = [row.Unknown_NO, row.Unknown_mz.toFixed(6), row.Substrate_Name, row.Modification_Type, directionLabel(row.Direction), row.PPM_Error.toFixed(4)];
    cells.forEach(value => tr.append(text('td', value)));
    body.append(tr);
  }
  if (!filtered.length) {
    const td = text('td', output?.results.length ? 'No candidates match the current filters.' : 'No candidates within this tolerance.');
    td.colSpan = 6;
    td.className = 'empty';
    const tr = document.createElement('tr');
    tr.append(td);
    body.append(tr);
  }
  $('page').textContent = `${filtered.length.toLocaleString()} rows · ${filtered.length ? page + 1 : 0} / ${Math.ceil(filtered.length / pageSize)}`;
  $('prev').disabled = page === 0;
  $('next').disabled = (page + 1) * pageSize >= filtered.length;
}

function charts() {
  const counts = new Map();
  output.results.forEach(row => counts.set(row.Modification_Type, (counts.get(row.Modification_Type) || 0) + 1));
  const entries = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 8);
  $('bars').replaceChildren();
  const palette = ['#247f9e', '#299486', '#6e68b0', '#c18a3e', '#5e8db6', '#a06a95', '#6e985d', '#b77359'];
  for (const [index, [name, count]] of entries.entries()) {
    const row = document.createElement('div');
    row.className = 'bar-row';
    const label = text('span', name);
    label.title = name;
    const track = document.createElement('div');
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.backgroundColor = palette[index];
    bar.style.width = `${count / entries[0][1] * 100}%`;
    track.append(bar);
    row.append(label, track, text('span', count));
    $('bars').append(row);
  }
  const bins = Array(20).fill(0);
  const tolerance = output.parameters.ppm;
  output.results.forEach(row => bins[Math.min(19, Math.max(0, Math.floor((row.PPM_Error + tolerance) / (2 * tolerance) * 20)))]++);
  $('hist').replaceChildren();
  const plot = document.createElement('div');
  plot.className = 'histogram';
  bins.forEach((count, i) => {
    const bar = document.createElement('div');
    bar.className = 'bin';
    bar.style.backgroundColor = i < 10 ? '#299486' : '#6e68b0';
    bar.style.height = `${count / (Math.max(...bins) || 1) * 100}%`;
    bar.title = `${(-tolerance + i * tolerance / 10).toFixed(2)} to ${(-tolerance + (i + 1) * tolerance / 10).toFixed(2)} ppm: ${count}`;
    plot.append(bar);
  });
  const axis = document.createElement('div');
  axis.className = 'axis';
  [-tolerance, 0, tolerance].forEach(value => axis.append(text('span', `${value} ppm`)));
  $('hist').append(plot, axis);
  if (!entries.length) $('bars').append(text('p', 'No matches within this tolerance.'));
}

function safeRows(rows) {
  return rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) =>
    [key, typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? "'" + value : value]
  )));
}

function resultSheet() {
  return output.results.length ? XLSX.utils.json_to_sheet(safeRows(output.results.map(row => ({...row, Direction: directionLabel(row.Direction)})))) : XLSX.utils.aoa_to_sheet([
    ['Substrate_Row', 'Substrate_NO', 'Substrate_Name', 'Substrate_mz', 'Substrate_RT', 'Unknown_Row', 'Unknown_NO', 'Unknown_mz', 'Unknown_RT', 'Modification_Row', 'Modification_Type', 'Neutral_Loss', 'Modification_Mass', 'Direction', 'Predicted_mz', 'Mass_Error', 'PPM_Error', 'Absolute_PPM', 'Delta_RT']
  ]);
}

function exportXlsx() {
  if (!output) return;
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, resultSheet(), 'Candidates');
  const sheets = [
    ['Parameters', Object.entries(output.parameters).map(([Parameter, Value]) => ({Parameter, Value}))],
    ['Summary', [output.stats]], ['Features', output.features], ['Modifications', output.mods]
  ];
  for (const [name, rows] of sheets) XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(safeRows(rows)), name);
  XLSX.writeFile(book, 'Metabolite_modification_results.xlsx');
}

function exportCsv() {
  if (!output) return;
  const blob = new Blob(['\ufeff' + XLSX.utils.sheet_to_csv(resultSheet())], {type: 'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'Metabolite_candidates.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

for (const kind of ['features', 'mods']) {
  $(kind).onchange = event => upload(kind, event.target.files[0]);
  $(`example-${kind}`).onclick = () => loadExample(kind);
  for (const suffix of ['example', 'format']) $(`${kind}-${suffix}`).onchange = () => updateExampleLink(kind);
  updateExampleLink(kind);
}
for (const id of ['ppm', 'direction']) $(id).oninput = invalidate;
$('run').onclick = run;
$('search').oninput = filter;
$('filterDir').onchange = filter;
$('prev').onclick = () => { page--; render(); };
$('next').onclick = () => { page++; render(); };
$('export').onclick = exportXlsx;
$('csv').onclick = exportCsv;

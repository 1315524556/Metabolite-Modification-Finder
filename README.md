# Metabolite Modification Finder v1.0

A browser-local research tool for screening possible substrate–modification relationships in MS1 feature tables. English interface, Excel/CSV input, column mapping, configurable ppm tolerance, charts, and reproducible Excel export. No server receives analytical files. The manuscript feature tables and modification library are included in both XLSX and CSV formats.

## Run locally

Requires Python 3 only for the static server:

```bash
python3 -m http.server 8080 --directory dist
```

Open http://localhost:8080. You can also double-click `dist/index.html` directly, including on Windows. A self-contained Blob Worker supports `file://` and HTTP(S); if workers are unavailable, calculation falls back to the main thread. Keep the entire `dist` directory together. Node.js is needed only for tests: `npm test`. No npm install or build step is needed. Publish the contents of `dist/` using GitHub Pages or another static host. The `.openai/hosting.json` file is specific to the private Sites deployment and is not needed on GitHub Pages.

## Workflow

1. Load an example separately for each input, or select your feature table and modification library (XLSX, XLS, CSV; up to 100 MB per file).
2. Use the collapsible Column mapping controls when necessary. Recognized column names are mapped automatically. Headers must occupy the first row.
3. Set tolerance (default 10 ppm) and direction. The denominator is fixed to the unknown observed m/z.
4. Run matching. Search and paginate the candidate table.
5. Export all candidates to XLSX or CSV. Table search does not restrict exports or charts.

Each input has its own Load example and Download example controls. Select the dataset and format before using either action:

| Dataset | Formats | Data rows | Columns |
| --- | --- | ---: | ---: |
| Positive | [XLSX](dist/examples/Positive.xlsx) / [CSV](dist/examples/Positive.csv) | 5,462 | 189 |
| Negative | [XLSX](dist/examples/Negative.xlsx) / [CSV](dist/examples/Negative.csv) | 7,909 | 188 |
| Modification library | [XLSX](dist/examples/Modification_List.xlsx) / [CSV](dist/examples/Modification_List.csv) | 66 | 3 |

XLSX downloads are byte-for-byte copies of the author-provided originals. CSV files contain all columns of the first worksheet, use UTF-8 with BOM, preserve numeric precision, and omit Excel-only formatting and formulas (cached cell values are used). `dist/examples/manifest.json` records SHA-256 checksums. At 10 ppm with both directions, this application's stated matching rules produce 16,719 positive-mode candidates and 9,187 negative-mode candidates. These counts describe the current algorithm and must not be interpreted as proof of identity with a historical result workbook.

On HTTP(S), Load example reads the same downloadable file. Under file://, local script chunks reconstruct the original XLSX bytes; the shared converter produces the same CSV text when CSV is selected. Large datasets load only on request. Run `node scripts/build-examples.cjs /path/to/original/files` to rebuild the assets.

## Input schema

| Table | Column | Meaning |
| --- | --- | --- |
| Features | Name | Trimmed nonempty values define known substrates; blank values define unknowns |
| Features | m/z | Finite positive observed m/z |
| Features | NO | Optional identifier; original spreadsheet row remains an independent identifier |
| Features | RT [min] | Optional retention time; invalid/missing values become blank |
| Modifications | Modified Type | Nonempty modification label |
| Modifications | m/z | Finite positive mass difference |
| Modifications | Neutral Loss | Optional formula or annotation |

Columns can be remapped to other names. Every unknown is tested against every substrate and modification in the chosen direction. Duplicate IDs and multiple explanations are retained. Invalid masses cause an explicit error, not silent exclusion. Blank rows are skipped. Numeric Name cells are considered named.

## Matching definition

For substrate m/z `s`, modification mass `d`, and unknown observed m/z `u`:

```text
predicted = s + d   or   s - d
signed_ppm = (u - predicted) / u * 1e6
retain if abs(signed_ppm) <= tolerance
```

Nonpositive predictions are excluded. The implementation uses an inclusive boundary with a 1e-8 ppm floating-point allowance. Unknowns are sorted by m/z and searched using binary intervals; a final explicit ppm comparison verifies each result. A 1,000,000-result guard stops analysis with an error rather than exporting truncated results.

The web interface fixes the denominator to unknown observed m/z, consistent with the supplied 20240326 script. That script searches only `abs(substrate - modification)` and reads a separate substrate workbook; it does not exclude named target features. The 20240325 script instead divides by modification mass. The new application follows the requested named-substrate / unnamed-target partition and supports both addition and subtraction. The engine retains the legacy denominator for regression comparisons only; it is not exposed in the interface.

These are MS1 candidates, not confirmed identifications. Input masses must use compatible charge/adduct conventions. Mass shifts are applied directly, with no charge scaling, neutral-mass conversion, isotope filtering, or adduct inference. RT differences are descriptive only. Matching does not prove a chemical transformation or its direction.

## Output and reproducibility

XLSX sheets: Candidates, Parameters, Summary, Features, Modifications. Inputs contain the mapped analytical columns, not all intensity columns. Parameters record timestamp, software version, filenames, worksheets, denominator, direction, threshold, and method conventions. Candidate rows include both source row numbers, IDs, masses, RTs, modification details, predicted m/z, signed/absolute ppm error, and RT difference. CSV includes candidates only. Direction values in both exports and the result table are `Addition only (+)` or `Subtraction only (−)`, exactly matching the corresponding Search direction option. A search over both directions records the actual direction on each candidate; the Parameters sheet records `Addition & subtraction`. Potential spreadsheet formula prefixes in user strings are escaped on export.

Charts show candidate counts (not distinct molecules): top eight modification names and a 20-bin signed ppm histogram. Hover bars for details. The displayed matched-unknown count uses source rows, not potentially duplicated IDs.

## Validation

`npm test` checks addition/subtraction, name classification, ppm denominator, inclusive boundary, invalid values, duplicate IDs, direction filtering, and agreement with an independent brute-force calculation on seeded random data.

`node tests/validate-original.cjs` optionally compares the original workbooks in the parent directory with historical results and writes `validation.json`. These original research files are not required to use the application. Historical results may include named target features excluded by the current specification.

## Project layout

- `dist/engine.js`: pure matching implementation.
- `dist/runner.js`: self-contained Blob worker and main-thread fallback.
- `dist/examples.js`, `dist/examples/`: manuscript files, provenance manifest, and lazy offline payloads.
- `dist/app.js`: file parsing, column mapping, charts and exports.
- `dist/index.html`, `dist/style.css`: responsive interface.
- `tests/`: matching regression tests and optional original-data comparison.
- `scripts/`: example-data packaging tools.
- `legacy/`: unmodified original positive- and negative-mode Python scripts from 20240325 and 20240326, retained for methodological review.

SheetJS CE 0.20.3 is vendored from the official distribution; its Apache-2.0 license is in `dist/vendor/LICENSE.txt`. No runtime CDN dependency is required. Select a project license and fill in the manuscript citation / authors before public release; no ownership or publication metadata has been invented.

## Original scripts

The four Python files in `legacy/` are archival source copies, including their original comments and filenames. They are independent of the web application. They require pandas, an Excel reader such as openpyxl, and separate `Substrate-pos.xlsx` / `Substrate-neg.xlsx` inputs that are not included in this release. They also expect the historical filename `Modification List.xlsx`; the bundled library is named `Modification_List.xlsx`. Their matching rules differ as described above. Use the web application for the v1.0 workflow.

## GitHub distribution

Keep this repository together when publishing: the readable application source and website are in `dist/`, all six manuscript example files are in `dist/examples/`, and the original analysis scripts are in `legacy/`. No compiled application or build step is required. The example payload scripts in `dist/examples/` are required for loading examples when opening `dist/index.html` directly from disk.

Upload the extracted project files, including this README, the scripts and tests, and the full `dist/` directory. Local Git metadata, release ZIP archives, and the Sites-specific `.openai/` configuration are not part of the GitHub distribution. For website hosting, publish the contents of `dist/` using GitHub Pages or another static host.

## Interface and release

The input-first layout was informed by the MetaboAnalyst data upload workflow (https://www.metaboanalyst.ca/MetaboAnalyst/upload/StatUploadView.xhtml; Nucleic Acids Research 2024, doi:10.1093/nar/gkae253) and the Workflow4Metabolomics portal (https://workflow4metabolomics.org/). These are design references, not affiliations or endorsements. Decorative banners and the on-page formula/method blocks have been removed; scientific definitions remain in this README and exported parameters.

The public release is **v1.0** (package metadata uses SemVer `1.0.0`); interface iterations are not separate releases.

Optional browser regression: install Playwright in a separate test environment, then run `PLAYWRIGHT_MODULE=/absolute/path/to/playwright node tests/browser.cjs`. It exercises file and HTTP origins, independent examples, uploaded XLSX inputs, exports, denominator consistency, errors, and worker fallback.

# Lanyard Maker

A static web app for making lanyard badges / name cards for a camp (or any event).
Upload a CSV, design one badge template with drag-and-drop, and print every card
onto cut-ready sheets — straight from the browser, with nothing sent to a server.

Built with [SolidJS](https://www.solidjs.com/) + [Vite](https://vitejs.dev/), deployed to GitHub Pages automatically.

## What it does

1. **Data** – drop in a CSV (comma, semicolon or tab separated; the first row is the headers).
   You get a preview table plus, for every column, the shortest, median and longest value.
2. **Design** – a canvas showing one badge at real proportions. Add text boxes bound to CSV
   columns (`{{Name}}`, `Cabin {{Accommodation}}`…), fixed text, colour bands and a logo.
   Drag to move, drag handles to resize, set fonts, alignment, colours, padding, borders.
   Text boxes **shrink to fit** down to a minimum size you choose. Anything that *still*
   doesn't fit its box, or that would be **cut off by the edge of the card**, is outlined in
   red and named in the fit check. A shape or text box can be **coloured by a field**
   (e.g. one colour per cabin), and an image can show a **different picture per value of a
   field** — a bear for the Bears, a lion for the Lions. Name your files after the values
   (`bears.png`, `lion.jpg`) and upload them all at once; a fallback picture covers the rest.
3. **Fit check** – three live previews under the canvas, each built from *every field's*
   shortest, median and longest value across the whole CSV. The "Longest" card is the
   worst case for your layout; "Shortest" shows that short names still look balanced.
4. **Print** – pick paper size (A4, A3, Letter, Legal or custom), orientation, margins and
   gaps; the app lays the cards out, adds crop marks and prints (or saves as PDF) every
   sheet. Optionally print two copies of each card for fold-over / double-sided holders,
   or just a few rows for reprints.

The template and roster are saved in your browser automatically and the template can be
exported/imported as JSON.

## Where your work is saved

Everything stays in your browser — nothing is uploaded anywhere. State is kept in
**IndexedDB**, whose quota is a share of your disk (Chrome allows up to 60 % of it per site,
Firefox 10 % up to 10 GB, Safari about 1 GB before asking), so templates with many pictures and
rosters with tens of thousands of rows fit comfortably. The first time pictures are saved the
app asks the browser to treat the site's storage as persistent so it is not cleaned up under
disk pressure (Chrome decides silently, Firefox may show a prompt). The Template section of the
inspector shows which storage is in use, how much of the quota is taken and whether it is
protected.

If IndexedDB is unavailable (some private-browsing modes or locked-down browsers) the app falls
back to localStorage, which only holds about 5 MB, and says so. If a save fails for any reason a
banner appears at the top — export the template as JSON to keep it. State saved by earlier
versions in localStorage is migrated automatically on first load.

Saving is debounced while you drag and flushed when you leave the page, so a reload right after
an edit does not lose it.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-checks and builds to dist/
npm run preview    # serves the production build
```

Node 22 is recommended (see `.nvmrc`).

## Deploy to GitHub Pages (automatic)

1. Create a GitHub repository and push this folder to its `main` branch.
2. In the repository go to **Settings → Pages** and under *Build and deployment* set
   **Source** to **GitHub Actions**.
3. That's it. Every push to `main` runs `.github/workflows/deploy.yml`, which builds the app
   and publishes it to `https://<your-user>.github.io/<repo>/`. The first run takes a minute
   or two; the URL is shown in the workflow summary.

The workflow uses `actions/configure-pages` to work out the base path, so it works for a
project site (`/<repo>/`), a user site (`<user>.github.io`) and custom domains without
changing anything.

The deploy runs the full test suite first; a failing test blocks the publish. Pull requests
and feature branches are type-checked, built and tested by `.github/workflows/ci.yml`, and
the Playwright HTML report is attached to every run as an artifact.

## Tests

The project ships with a [Playwright](https://playwright.dev/) suite (about 150 tests) that
runs against the production build:

```bash
npx playwright install chromium   # once
npm test                          # unit + UI tests, headless
npm run test:ui                   # UI tests only
npm run test:headed               # watch the browser while tests run
npm run test:report               # open the HTML report of the last run
```

- `tests/unit/` – fast Node-only tests of the pure modules (CSV parsing, shortest/median/longest
  statistics, placeholder substitution, sheet-layout maths, colour and picture rules, the
  content-addressed asset store).
- `tests/ui/` – end-to-end tests of the three tabs: CSV import by picker, drag-and-drop and paste;
  the designer (drag, resize, snapping, keyboard shortcuts, undo/redo, layers, every inspector
  control, colour-by-field, import/export); images (fixed pictures, downscaling, picture per
  value of a field with single and bulk upload, fallbacks, image URLs from a column); the fit
  check, including regression tests that a text box pushed past the card edge is reported as
  "cut off" instead of "fits"; deduplicated picture storage (same picture → one asset, pruning,
  export/import including legacy templates); the print tab (paper sizes, margins, gaps, crop
  marks, copies, row ranges, the print portal and the resulting PDF's page count and size); and
  persistence (IndexedDB round trips, flush on reload, migration from localStorage, a 50,000-row
  roster, corrupt stored data, and the warning shown when the browser refuses to save).

`playwright.config.ts` builds the app and serves it with `vite preview` automatically. If you
already have a Chromium you want to use, point `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` at it.

A hook is available in the browser console for debugging: `lanyardMaker.getTemplate()` returns
the current template, `lanyardMaker.getDataset()` the loaded CSV, and `lanyardMaker.storage`
reads and writes the underlying IndexedDB store.

## CSV tips

- Put one person per row. Column names become the fields you can place on the badge.
- Empty cells are fine. By default they are ignored when working out the shortest value
  (switch off "Ignore empty cells" under the fit-check cards to see how a blank field looks).
- Excel: *File → Save As → CSV UTF-8*. Google Sheets: *File → Download → CSV*.
- If a column holds image URLs (e.g. photos), an Image element can read its source from it
  ("Picture source → Image URL stored in a field").

## Pictures per group

Add an **Image** element and set *Picture source* to **Different picture per value of a
field**, then pick the field (e.g. `Group`). Every distinct value gets a row where you can
upload a picture, or use **Upload for all values…** and select all your files at once: a
file called `bears.png`, `Bear.jpg` or `bears (2).png` is matched to the value "Bears"
(case, spaces, punctuation and a trailing "s" are ignored). Values without a picture show
the optional *Anything else* fallback, or nothing at all when printed.

Uploaded pictures are stored inside the template, scaled down to at most 1200 px on the long
side (SVGs are kept as-is), and **deduplicated by content**: the same picture used for several
groups, on several image elements or as the card background is stored once, however many
times it appears (`template.assets` holds each picture under a content hash and elements refer
to it as `asset:<id>`). Pictures nothing refers to any more are dropped at the next save. The
Template section of the inspector shows how many pictures are stored and their size. Templates
exported by older versions (pictures inline) import fine and are converted on the way in.

When printing, the browser handles the rest: Chromium writes each distinct picture into the PDF
once, so 100 badges with the same logo cost about as much as one.

## Printing tips

- In the print dialog set **scale to 100%** (not "fit to page"), **margins to None**, and
  turn on **Background graphics** so colour bands print. Choose *Save as PDF* to get a file.
- Paper size in the dialog should match the one chosen in the app; the page is sized via
  `@page` so most browsers pick it up automatically.
- A 100 × 140 mm card (the default) fits a standard A6 lanyard holder and goes four to an
  A4 sheet with a 5 mm margin. Exact A6 (105 × 148) only fits one per A4 portrait sheet with
  printer margins (two in landscape), so choose it only if your holder is tight.

## Project layout

```
tests/
  unit/              pure-function tests (run in Node)
  ui/                Playwright end-to-end tests + helpers
src/
  components/
    App.tsx          tabs + top bar
    DataPanel.tsx    CSV upload, preview, per-column length stats
    Designer.tsx     canvas, drag/resize, keyboard shortcuts, zoom
    Layers.tsx       element list, add buttons, z-order
    Inspector.tsx    properties for the card / selected element
    Previews.tsx     shortest / median / longest fit check
    PrintPanel.tsx   sheet layout, crop marks, print portal
    Card.tsx         renders one badge from template + row
    TextBox.tsx      text element with shrink-to-fit measurement
    ui.tsx           small form controls
  lib/
    types.ts         Template / element / dataset types
    template.ts      defaults, placeholders, sheet layout maths, palette
    stats.ts         shortest / median / longest per column
    csv.ts           PapaParse wrapper + sample roster
    images.ts        image upload → data URL with downscaling
    storage.ts       IndexedDB key-value store, localStorage fallback, migration
    store.ts         Solid store, undo/redo, localStorage persistence
```

## Licence

MIT — do whatever you like with it.

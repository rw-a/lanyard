# Lanyard Maker

A static web app for making lanyard badges / name cards for a camp (or any event).
Upload a CSV, design one badge template with drag-and-drop, and print every card
onto cut-ready sheets — straight from the browser, with nothing sent to a server.

Built with [SolidJS](https://www.solidjs.com/), [Park UI](https://park-ui.com/),
[Panda CSS](https://panda-css.com/) and [Vite](https://vitejs.dev/), deployed to GitHub Pages automatically.

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
   sheet. Print several copies of each badge, or just a few rows for reprints.

Badges can be **one-sided or double-sided** (see [Front and back](#front-and-back)).

The template and roster are saved in your browser automatically and the template can be
exported/imported as JSON. Exports use the filename `template.lanyard.json`.

## Where your work is saved

Everything stays in your browser — nothing is uploaded anywhere. State is kept in
**IndexedDB**, whose quota is a share of your disk (Chrome allows up to 60 % of it per site,
Firefox 10 % up to 10 GB, Safari about 1 GB before asking), so templates with many pictures and
rosters with tens of thousands of rows fit comfortably. The first time pictures are saved the
app asks the browser to treat the site's storage as persistent so it is not cleaned up under
disk pressure (Chrome decides silently, Firefox may show a prompt).

If IndexedDB is unavailable (some private-browsing modes or locked-down browsers) the app falls
back to localStorage, which only holds about 5 MB. If a save fails for any reason a
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

## UI components and styling

The interface uses Park UI's Solid components, built on Ark UI, with the default
neutral theme, component recipes, sizes and variants. Component source lives in
`src/components/park/`, and the theme lives in `src/theme/`. `src/components/ui.tsx`
composes those components into the app's labelled fields and sections.

Panda generates `styled-system/` during installation, builds and type checks. The
directory is ignored by Git; regenerate it with `npm run prepare` if needed.
`panda.config.ts` and `postcss.config.cjs` connect the theme to Vite. The generated
Park components use Panda 2's `createSlotRecipeContext` API.

`src/styles.css` contains the app layout, responsive rules and card canvas/print
styles. Buttons, dropdowns, checkboxes, switches, tabs, tables and disclosures use
Park UI's default styling. The preview divider uses Park UI's accessible splitter;
the sidebar sections use its accordion component.

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

The project ships with a [Playwright](https://playwright.dev/) suite (about 275 tests) that
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
  content-addressed asset store, side resolvers, template migrations against real version 1/2
  files in `tests/fixtures/`, and print plans for every mode, capacity and paper layout).
- `tests/ui/` – end-to-end tests of the three tabs: CSV import by picker, drag-and-drop and paste;
  front and back designs (the three sides modes, editing each side, undo across sides, uploads
  that finish after a side switch); the designer (drag, resize, snapping, keyboard shortcuts,
  undo/redo, layers, every inspector control, colour-by-field, import/export); images (fixed
  pictures, downscaling, picture per value of a field with single and bulk upload, fallbacks,
  image URLs from a column); the fit check, including regression tests that a text box pushed
  past the card edge is reported as "cut off" instead of "fits"; deduplicated picture storage
  (same picture → one asset, pruning, export/import including legacy templates); the print tab
  (paper sizes, margins, gaps, crop marks, copies, row ranges, separate cutouts and duplex
  layouts, the print portal and the resulting PDF's page count, order and size); and persistence
  (IndexedDB round trips, flush on reload, migration from localStorage, a 50,000-row roster,
  corrupt or newer stored data kept for recovery, and the warning shown when the browser refuses
  to save).

`playwright.config.ts` builds the app and serves it with `vite preview` automatically. If you
already have a Chromium you want to use, point `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` at it.

A hook is available in the browser console for debugging: `lanyardMaker.getTemplate()` returns
the current (version 3) template, `lanyardMaker.getEditor()` the side being edited and the
selection, `lanyardMaker.getDataset()` the loaded CSV, and `lanyardMaker.storage` reads and
writes the underlying IndexedDB store.

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
Template files section of the inspector shows each stored picture with a preview and its size.
Templates exported by older versions (pictures inline) import fine and are converted on the way in.

When printing, the browser handles the rest: Chromium writes each distinct picture into the PDF
once, so 100 badges with the same logo cost about as much as one.

## Front and back

Choose **Sides** in *Card Settings*:

| Sides | What you edit | What each badge gets |
| --- | --- | --- |
| One Sided | the front | a front |
| Double-Sided — Same on Both Sides | one design, labelled *Front & Back* | that design on both faces |
| Double-Sided — Different on Each Side | a front and a back, switched with **Front / Back** above the canvas | its own front and back |

- Size and corner radius are shared; each independently designed side has its own background
  colour, background picture and layers. Both faces of a badge use the same CSV row.
- The first time you choose different sides the back starts as a copy of the front. **Copy Front
  to Back** and **Clear Back** (shown while editing the back) start it over; both ask first when
  the back has content and both can be undone.
- Switching to one-sided or same-on-both-sides keeps a separate back saved (with its pictures);
  choosing different sides again brings it back exactly as it was.
- The canvas, layers, inspector, background controls and *Fit Check* all follow the side being
  edited. A fit check result covers that side and that preview only, so switch sides to check both.
- Undo/redo works across sides and shows the side whose content changed.

## Printing double-sided badges

**Copies of Each Badge** counts complete badges per person: a double-sided badge is one badge
with two printed faces. The summary shows people, badges, printed faces, physical sheets and,
for duplex, PDF pages. For 25 people, one copy, four card slots per sheet:

| Output | Badges | Printed faces | Sheets | PDF pages |
| --- | ---: | ---: | ---: | ---: |
| One Sided | 25 | 25 | 7 | 7 |
| Double-sided, Separate Cutouts | 25 | 50 | 13 | 13 |
| Double-sided, Duplex Sheets | 25 | 50 | 7 | 14 |

Double-sided designs offer two **printing methods** on the Print tab (one-sided designs always
print ordinary sheets):

- **Separate Cutouts** (default) – each badge's front is printed with its back right beside it,
  both upright, on one side of the paper. Print **one-sided**, cut out each pair and place them
  back to back in the holder. With room for only one card per sheet, the front and back go on
  two consecutive sheets.
- **Duplex Sheets** – PDF pages alternate *sheet 1 front, sheet 1 back, sheet 2 front…*. The
  backs are laid out for turning the sheet over **from left to right** (around its vertical axis):
  print double-sided with **flip on long edge** for portrait paper or **flip on short edge** for
  landscape (square paper counts as portrait). Each back is placed at its front's position
  mirrored across the page; the artwork itself is never mirrored. The back preview is shown as
  seen from the back, so the order of badges looks reversed. A back page is always printed, even
  when blank, so later sheets stay aligned. Crop marks and outlines are printed on fronts only.
  Use **Print Test Sheet** to print the previewed sheet's front and back and hold it up to the
  light before printing everything; how well the two sides line up depends on your printer.
  The duplex layout has been checked in the browser and PDF, but not yet on physical printers.

The browser cannot choose duplex or binding settings for you (`window.print()` takes no options),
so pick them in the print dialog. A saved PDF must later be printed with the same settings.

When you print, the app takes a snapshot of the design and the selected rows, lays every page out
off-screen, and waits for fonts, pictures and text fitting to settle before opening the print
dialog. If a picture cannot be loaded it says so and lets you try again, print anyway or cancel.

## Template format

Templates are saved and exported as format **version 3**: shared card geometry, the sides mode,
a `sides.front` design and an optional `sides.back` design (kept while unused), page settings
including `printMethod`, and the shared picture store. Version 1 and 2 templates (one design)
are upgraded automatically on load or import: they become one-sided with Separate Cutouts as
the remembered method, and print exactly as before — `copies: 2` stays two copies and is never
taken to mean double-sided. Versions of the app from before front/back support cannot read
version 3 files.

An import that cannot be read is rejected with a message and changes nothing. If the template
saved in the browser cannot be read (damaged, or written by a newer version of the app), the
default design is loaded and the original is kept under the `template-recovery` key and offered
as a download; if even that backup fails, auto-saving the template pauses so the original is not
overwritten.

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
    PrintPanel.tsx   print method, sheet/face preview, summary, print run
    SideSwitcher.tsx Front / Back navigation above the canvas
    TemplateBasics.tsx  card size, sides mode, side background
    Card.tsx         renders one face of a badge from template + side + row
    TextBox.tsx      text element with shrink-to-fit measurement
    ui.tsx           app compositions of Park UI controls
    park/            Park UI Solid component source
  theme/             Park UI tokens and component recipes
  lib/
    types.ts         Template / element / dataset types
    template.ts      defaults, placeholders, sheet layout maths, palette, picture store
    sides.ts         which design each face shows; cloning sides
    template-migrations.ts  reading v1/v2/v3 templates (validation + upgrade)
    print-plan.ts    badges → pages with explicit front/back placements, crop marks
    print-ready.ts   waits for fonts, pictures and text fitting before printing
    stats.ts         shortest / median / longest per column
    csv.ts           PapaParse wrapper + sample roster
    images.ts        image upload → data URL with downscaling
    storage.ts       IndexedDB key-value store, localStorage fallback, migration
    store.ts         Solid store, side being edited, undo/redo, persistence
```

import { For, Show, createMemo, createSignal } from 'solid-js';
import { SAMPLE_CSV, parseCsv, readFileAsText } from '../lib/csv';
import { columnStats } from '../lib/stats';
import { dataset, ignoreEmpty, setDataset, setIgnoreEmpty, setTab, template, usedColumns } from '../lib/store';
import { Section, Switch } from './ui';

export default function DataPanel() {
  const [warnings, setWarnings] = createSignal<string[]>([]);
  const [dragOver, setDragOver] = createSignal(false);
  const [pasteOpen, setPasteOpen] = createSignal(false);
  const [pasteText, setPasteText] = createSignal('');
  let fileInput!: HTMLInputElement;

  async function loadFile(file: File) {
    try {
      const text = await readFileAsText(file);
      loadText(text, file.name);
    } catch (e) {
      setWarnings([`Could not read ${file.name}: ${(e as Error).message}`]);
    }
  }

  function loadText(text: string, name: string) {
    const { dataset: ds, warnings: w } = parseCsv(text, name);
    setWarnings(w);
    if (ds.headers.length > 0) {
      setDataset(ds);
    }
  }

  const stats = createMemo(() => {
    const ds = dataset();
    if (!ds) return [];
    return ds.headers.map((h) => columnStats(ds.rows, h, ignoreEmpty()));
  });

  const previewRows = createMemo(() => dataset()?.rows.slice(0, 8) ?? []);

  return (
    <div class="panel-scroll">
      <div class="data-layout">
        <div
          class="dropzone"
          classList={{ over: dragOver() }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer?.files?.[0];
            if (f) void loadFile(f);
          }}
        >
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/plain"
            hidden
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              if (f) void loadFile(f);
              e.currentTarget.value = '';
            }}
          />
          <div class="dropzone-icon" aria-hidden="true">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              <path d="M12 3v12" />
              <path d="m7 8 5-5 5 5" />
            </svg>
          </div>
          <h2>Drop your CSV here</h2>
          <p class="muted">
            First row must be the column headers (e.g. <code>Name, Accommodation, Group</code>). Comma, semicolon and tab separated files all
            work. Nothing is uploaded anywhere — everything stays in your browser.
          </p>
          <div class="row gap">
            <button class="btn primary" onClick={() => fileInput.click()}>
              Choose file…
            </button>
            <button class="btn" onClick={() => setPasteOpen((v) => !v)}>
              Paste text
            </button>
            <button class="btn" onClick={() => loadText(SAMPLE_CSV, 'sample-camp-roster.csv')}>
              Load sample roster
            </button>
          </div>
          <Show when={pasteOpen()}>
            <div class="paste-box" onClick={(e) => e.stopPropagation()}>
              <textarea
                class="input"
                rows={8}
                placeholder={'Name,Accommodation,Group\nAda Lovelace,Cabin 3,Otters'}
                value={pasteText()}
                onInput={(e) => setPasteText(e.currentTarget.value)}
              />
              <div class="row gap">
                <button
                  class="btn primary"
                  disabled={!pasteText().trim()}
                  onClick={() => {
                    loadText(pasteText(), 'pasted.csv');
                    setPasteOpen(false);
                  }}
                >
                  Use this data
                </button>
                <button class="btn" onClick={() => setPasteOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </Show>
        </div>

        <Show when={warnings().length > 0}>
          <div class="notice warn">
            <strong>Heads up:</strong>
            <ul>
              <For each={warnings()}>{(w) => <li>{w}</li>}</For>
            </ul>
          </div>
        </Show>

        <Show when={dataset()}>
          {(ds) => (
            <>
              <Section
                title={`${ds().fileName} — ${ds().rows.length} ${ds().rows.length === 1 ? 'person' : 'people'}, ${ds().headers.length} columns`}
                actions={
                  <div class="row gap">
                    <button class="btn" onClick={() => setDataset(null)}>
                      Remove data
                    </button>
                    <button class="btn primary" onClick={() => setTab('design')}>
                      Design the badge →
                    </button>
                  </div>
                }
              >
                <p class="muted small">
                  Columns used by the current template: {' '}
                  <Show when={usedColumns().length > 0} fallback={<em>none yet</em>}>
                    <For each={usedColumns()}>
                      {(c) => <span class="chip" classList={{ missing: !ds().headers.includes(c) }}>{c}</span>}
                    </For>
                  </Show>
                  <Show when={usedColumns().some((c) => !ds().headers.includes(c))}>
                    {' '}
                    <span class="warn-text">Red columns are referenced by the template but do not exist in this file — fix them in Design.</span>
                  </Show>
                </p>
                <div class="table-wrap">
                  <table class="table">
                    <thead>
                      <tr>
                        <th class="idx">#</th>
                        <For each={ds().headers}>{(h) => <th>{h}</th>}</For>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={previewRows()}>
                        {(r, i) => (
                          <tr>
                            <td class="idx">{i() + 1}</td>
                            <For each={ds().headers}>{(h) => <td>{r[h]}</td>}</For>
                          </tr>
                        )}
                      </For>
                      <Show when={ds().rows.length > previewRows().length}>
                        <tr>
                          <td class="idx muted">…</td>
                          <td colSpan={ds().headers.length} class="muted">
                            and {ds().rows.length - previewRows().length} more
                          </td>
                        </tr>
                      </Show>
                    </tbody>
                  </table>
                </div>
              </Section>

              <Section
                title="Text length per column"
                actions={
                  <Switch
                    checked={ignoreEmpty()}
                    onChange={setIgnoreEmpty}
                    label="Ignore empty cells"
                    title="When off, an empty cell counts as the shortest value"
                  />
                }
              >
                <p class="muted small">
                  These are the values the <strong>Shortest</strong>, <strong>Median</strong> and <strong>Longest</strong> previews use. Each column is
                  picked independently, so the "longest" card combines the longest value of every field at once — the worst case for your layout.
                </p>
                <div class="table-wrap">
                  <table class="table stats">
                    <thead>
                      <tr>
                        <th>Column</th>
                        <th>Shortest</th>
                        <th>Median</th>
                        <th>Longest</th>
                        <th class="num-col">Empty</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={stats()}>
                        {(s) => (
                          <tr classList={{ used: usedColumns().includes(s.column) }}>
                            <td>
                              <strong>{s.column}</strong>
                            </td>
                            <td>
                              <span class="val">{s.shortest || <em class="muted">(empty)</em>}</span> <span class="len">{s.minLen}</span>
                            </td>
                            <td>
                              <span class="val">{s.median || <em class="muted">(empty)</em>}</span> <span class="len">{s.medianLen}</span>
                            </td>
                            <td>
                              <span class="val">{s.longest || <em class="muted">(empty)</em>}</span> <span class="len">{s.maxLen}</span>
                            </td>
                            <td class="num-col">{s.empty}</td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </Section>
            </>
          )}
        </Show>

        <Show when={!dataset()}>
          <div class="notice">
            <strong>Tip:</strong> you can start designing without data — the template "{template.name}" will show placeholder field names until a
            CSV is loaded.{' '}
            <button class="link" onClick={() => setTab('design')}>
              Go to Design
            </button>
          </div>
        </Show>
      </div>
    </div>
  );
}

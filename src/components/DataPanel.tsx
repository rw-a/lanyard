import { For, Show, createMemo, createSignal } from 'solid-js';
import { ArrowRight, Upload } from 'lucide-solid';
import { SAMPLE_CSV, parseCsv, readFileAsText } from '../lib/csv';
import { columnStats } from '../lib/stats';
import { dataset, ignoreEmpty, setDataset, setIgnoreEmpty, setTab, template, usedColumns } from '../lib/store';
import { Section, Switch, Button, Textarea, Notice, Badge, Table, Heading } from './ui';

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
            <Upload size={40} />
          </div>
          <Heading as="h2" textStyle="xl" color="fg.default">Drop Your CSV Here</Heading>
          <p class="muted">
            First row must be the column headers (e.g. <code>Name, Accommodation, Group</code>). Comma, semicolon and tab separated files all
            work. Nothing is uploaded anywhere — everything stays in your browser.
          </p>
          <div class="row gap">
            <Button size="md" class="btn primary" onClick={() => fileInput.click()}>
              Choose file…
            </Button>
            <Button variant="outline" size="md" class="btn" onClick={() => setPasteOpen((v) => !v)}>
              Paste text
            </Button>
            <Button variant="outline" size="md" class="btn" onClick={() => loadText(SAMPLE_CSV, 'sample-camp-roster.csv')}>
              Load sample roster
            </Button>
          </div>
          <Show when={pasteOpen()}>
            <div class="paste-box" onClick={(e) => e.stopPropagation()}>
              <Textarea
                class="input"
                rows={8}
                placeholder={'Name,Accommodation,Group\nAda Lovelace,Cabin 3,Otters'}
                value={pasteText()}
                onInput={(e) => setPasteText(e.currentTarget.value)}
              />
              <div class="row gap">
                <Button size="md"
                  class="btn primary"
                  disabled={!pasteText().trim()}
                  onClick={() => {
                    loadText(pasteText(), 'pasted.csv');
                    setPasteOpen(false);
                  }}
                >
                  Use this data
                </Button>
                <Button variant="outline" size="md" class="btn" onClick={() => setPasteOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </Show>
        </div>

        <Show when={warnings().length > 0}>
          <Notice warning class="notice warn">
            <strong>Heads up:</strong>
            <ul>
              <For each={warnings()}>{(w) => <li>{w}</li>}</For>
            </ul>
          </Notice>
        </Show>

        <Show when={dataset()}>
          {(ds) => (
            <>
              <Section
                title={`${ds().fileName} — ${ds().rows.length} ${ds().rows.length === 1 ? 'Person' : 'People'}, ${ds().headers.length} Columns`}
                actions={
                  <div class="row gap">
                    <Button variant="outline" size="md" class="btn" onClick={() => setDataset(null)}>
                      Remove data
                    </Button>
                    <Button size="md" class="btn primary" onClick={() => setTab('design')}>
                      Design the badge <ArrowRight aria-hidden="true" />
                    </Button>
                  </div>
                }
              >
                <p class="muted small">
                  Columns used by the current template: {' '}
                  <Show when={usedColumns().length > 0} fallback={<em>none yet</em>}>
                    <For each={usedColumns()}>
                      {(c) => <Badge class={ds().headers.includes(c) ? 'chip' : 'chip missing'} colorPalette={ds().headers.includes(c) ? 'gray' : 'red'}>{c}</Badge>}
                    </For>
                  </Show>
                  <Show when={usedColumns().some((c) => !ds().headers.includes(c))}>
                    {' '}
                    <span class="warn-text">Red columns are referenced by the template but do not exist in this file — fix them in Design.</span>
                  </Show>
                </p>
                <div class="table-wrap">
                  <Table.Root class="table">
                    <Table.Head>
                      <Table.Row>
                        <Table.Header class="idx">#</Table.Header>
                        <For each={ds().headers}>{(h) => <Table.Header>{h}</Table.Header>}</For>
                      </Table.Row>
                    </Table.Head>
                    <Table.Body>
                      <For each={previewRows()}>
                        {(r, i) => (
                          <Table.Row>
                            <Table.Cell class="idx">{i() + 1}</Table.Cell>
                            <For each={ds().headers}>{(h) => <Table.Cell>{r[h]}</Table.Cell>}</For>
                          </Table.Row>
                        )}
                      </For>
                      <Show when={ds().rows.length > previewRows().length}>
                        <Table.Row>
                          <Table.Cell class="idx muted">…</Table.Cell>
                          <Table.Cell colSpan={ds().headers.length} class="muted">
                            and {ds().rows.length - previewRows().length} more
                          </Table.Cell>
                        </Table.Row>
                      </Show>
                    </Table.Body>
                  </Table.Root>
                </div>
              </Section>

              <Section
                title="Text Length per Column"
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
                  <Table.Root class="table stats">
                    <Table.Head>
                      <Table.Row>
                        <Table.Header>Column</Table.Header>
                        <Table.Header>Shortest</Table.Header>
                        <Table.Header>Median</Table.Header>
                        <Table.Header>Longest</Table.Header>
                        <Table.Header class="num-col">Empty</Table.Header>
                      </Table.Row>
                    </Table.Head>
                    <Table.Body>
                      <For each={stats()}>
                        {(s) => (
                          <Table.Row class={usedColumns().includes(s.column) ? 'used' : undefined}>
                            <Table.Cell>
                              <strong>{s.column}</strong>
                            </Table.Cell>
                            <Table.Cell>
                              <span class="val">{s.shortest || <em class="muted">(empty)</em>}</span> <span class="len">{s.minLen}</span>
                            </Table.Cell>
                            <Table.Cell>
                              <span class="val">{s.median || <em class="muted">(empty)</em>}</span> <span class="len">{s.medianLen}</span>
                            </Table.Cell>
                            <Table.Cell>
                              <span class="val">{s.longest || <em class="muted">(empty)</em>}</span> <span class="len">{s.maxLen}</span>
                            </Table.Cell>
                            <Table.Cell class="num-col">{s.empty}</Table.Cell>
                          </Table.Row>
                        )}
                      </For>
                    </Table.Body>
                  </Table.Root>
                </div>
              </Section>
            </>
          )}
        </Show>

        <Show when={!dataset()}>
          <Notice class="notice">
            <strong>Tip:</strong> you can start designing without data — the template "{template.name}" will show placeholder field names until a
            CSV is loaded.{' '}
            <Button variant="plain" size="md" class="link" onClick={() => setTab('design')}>
              Go to Design
            </Button>
          </Notice>
        </Show>
      </div>
    </div>
  );
}

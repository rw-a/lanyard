import { For, Show } from 'solid-js';
import { dataset, persistError, rows, setTab, tab, template, type Tab } from '../lib/store';
import DataPanel from './DataPanel';
import Designer from './Designer';
import PrintPanel from './PrintPanel';

export default function App() {
  const steps: { id: Tab; label: string; n: number }[] = [
    { id: 'data', label: 'Data', n: 1 },
    { id: 'design', label: 'Design', n: 2 },
    { id: 'print', label: 'Print', n: 3 },
  ];

  return (
    <div class="app">
      <header class="topbar">
        <div class="brand" data-testid="brand">
          <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
            <rect x="6" y="8" width="20" height="20" rx="3" fill="#1f6feb" />
            <rect x="13" y="3" width="6" height="8" rx="2" fill="#555" />
            <rect x="9" y="15" width="14" height="2" fill="white" />
            <rect x="9" y="20" width="9" height="2" fill="white" opacity=".7" />
          </svg>
          <span>Lanyard Maker</span>
        </div>
        <nav class="steps" aria-label="Steps" data-testid="steps">
          <For each={steps}>
            {(s) => (
              <button class="step" data-testid={`tab-${s.id}`} classList={{ active: tab() === s.id }} onClick={() => setTab(s.id)}>
                <span class="step-n">{s.n}</span>
                {s.label}
                <Show when={s.id === 'data' && dataset()}>
                  <span class="step-badge">{rows().length}</span>
                </Show>
              </button>
            )}
          </For>
        </nav>
        <div class="topbar-right muted small" data-testid="topbar-info">
          <span class="template-name" title={template.name}>
            {template.name}
          </span>
          <span class="sep" />
          <span class="card-size">
            {template.card.width} × {template.card.height} mm
          </span>
        </div>
      </header>

      <Show when={persistError()}>
        <div class="persist-warning" role="alert" data-testid="persist-warning">
          <strong>Not auto-saved.</strong> {persistError()} Use <em>Export JSON</em> (Design → Template) to keep your work.
        </div>
      </Show>

      <Show when={tab() === 'data'}>
        <DataPanel />
      </Show>
      <Show when={tab() === 'design'}>
        <Designer />
      </Show>
      <Show when={tab() === 'print'}>
        <PrintPanel />
      </Show>
    </div>
  );
}

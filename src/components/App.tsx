import { For, Show } from 'solid-js';
import { dataset, persistError, rows, setTab, tab, template, type Tab } from '../lib/store';
import DataPanel from './DataPanel';
import Designer from './Designer';
import PrintPanel from './PrintPanel';
import { Badge, Notice, Tabs } from './ui';

export default function App() {
  const steps: { id: Tab; label: string; n: number }[] = [
    { id: 'data', label: 'Data', n: 1 },
    { id: 'design', label: 'Design', n: 2 },
    { id: 'print', label: 'Print', n: 3 },
  ];

  return (
    <Tabs.Root class="app" value={tab()} onValueChange={(d) => setTab(d.value as Tab)}>
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
        <Tabs.List class="steps" aria-label="Steps" data-testid="steps">
          <For each={steps}>
            {(s) => (
              <Tabs.Trigger value={s.id} data-testid={`tab-${s.id}`}>
                <span>{s.n}</span>
                {s.label}
                <Show when={s.id === 'data' && dataset()}>
                  <Badge size="sm">{rows().length}</Badge>
                </Show>
              </Tabs.Trigger>
            )}
          </For>
          <Tabs.Indicator />
        </Tabs.List>
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
        <Notice warning class="persist-warning" role="alert" data-testid="persist-warning">
          <strong>Not auto-saved.</strong> {persistError()} Use <em>Export JSON</em> (Design → Template files) to keep your work.
        </Notice>
      </Show>

      <Tabs.Content value="data" class="workspace">
        <Show when={tab() === 'data'}><DataPanel /></Show>
      </Tabs.Content>
      <Tabs.Content value="design" class="workspace">
        <Show when={tab() === 'design'}><Designer /></Show>
      </Tabs.Content>
      <Tabs.Content value="print" class="workspace">
        <Show when={tab() === 'print'}><PrintPanel /></Show>
      </Tabs.Content>
    </Tabs.Root>
  );
}

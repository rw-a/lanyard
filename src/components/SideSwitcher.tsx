import { Show } from 'solid-js';
import { activeSide, setActiveSide, template } from '../lib/store';
import type { SideId } from '../lib/types';
import * as SegmentGroup from './park/segment-group';

/**
 * Front / Back navigation shown right above the canvas while the badge has a
 * different design on each side. Switching is navigation only (no undo step);
 * the canvas, layers, inspector, background and fit check all follow it.
 */
export default function SideSwitcher() {
  return (
    <Show when={template.sidedness === 'different'}>
      <div class="side-switcher" data-testid="side-switcher">
        <span class="muted small" id="side-switcher-label">
          Editing
        </span>
        <SegmentGroup.Root
          size="xs"
          value={activeSide()}
          onValueChange={(d) => d.value && setActiveSide(d.value as SideId)}
          aria-labelledby="side-switcher-label"
        >
          <SegmentGroup.Indicator />
          <SegmentGroup.Item value="front">
            <SegmentGroup.ItemText>Front</SegmentGroup.ItemText>
            <SegmentGroup.ItemHiddenInput />
          </SegmentGroup.Item>
          <SegmentGroup.Item value="back">
            <SegmentGroup.ItemText>Back</SegmentGroup.ItemText>
            <SegmentGroup.ItemHiddenInput />
          </SegmentGroup.Item>
        </SegmentGroup.Root>
      </div>
    </Show>
  );
}

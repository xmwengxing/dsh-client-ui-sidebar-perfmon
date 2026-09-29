/**
 * The perfmon panel's stylesheet.
 *
 * Injected once per client plugin load. Every class is namespaced
 * `dsh-perfmon-` so the sheet cannot reach the host UI, and every colour, radius
 * and font comes from the shared `--dsw-*` design tokens — a feature plugin may
 * not hard-code a palette or bring its own component library.
 *
 * @module dsh-client-ui-sidebar-perfmon/styles
 */

/** Element id of the singleton `<style>` node. */
export const STYLE_ID = 'dsh-perfmon-styles'

/** The panel stylesheet text. */
export const STYLES = `
.dsh-perfmon-root {
  display: flex;
  flex-direction: column;
  gap: 10px;
  block-size: 100%;
  min-block-size: 0;
  padding: 10px;
  box-sizing: border-box;
  font: var(--dsw-font-xs-13, 400 13px/1.5 var(--dsw-font-family, system-ui));
  color: var(--dsw-alias-label-primary, currentColor);
  overflow: hidden;
}

.dsh-perfmon-card {
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.24));
  border-radius: var(--dsw-radius-md, 10px);
  background: var(--dsw-alias-bg-layer-1, transparent);
  display: flex;
  flex-direction: column;
  min-block-size: 0;
  /* A card keeps the height its content needs: in a short pane the list is what
     gives way, and the gauges are never squeezed into the next card. */
  flex: 0 0 auto;
}

.dsh-perfmon-card--processes {
  /* The one card that takes the leftover height, and scrolls inside it. */
  flex: 1 1 auto;
  min-block-size: 96px;
  overflow: hidden;
  /* The two fixed metric tracks, declared once for the header and the rows.
     "1024.0%" needs 54px; "999.9 MB · 99%" needs 88px. */
  --perfmon-cpu-column: 54px;
  --perfmon-mem-column: 88px;
}

.dsh-perfmon-cardHead {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-block-end: 0.5px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.18));
}

.dsh-perfmon-cardTitle {
  font-weight: 600;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, currentColor);
  letter-spacing: 0.02em;
}

.dsh-perfmon-cardMeta {
  margin-inline-start: auto;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, currentColor);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dsh-perfmon-gauges {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  padding: 10px 6px 12px;
  flex: 0 0 auto;
}

.dsh-perfmon-gauge {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  min-inline-size: 0;
}

.dsh-perfmon-gaugeRing {
  position: relative;
  display: grid;
  place-items: center;
}

.dsh-perfmon-gaugeValue {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  /* Sized to stay inside the ring's inner diameter even at four digits
     ("1024.0%" is the realistic worst case on the per-core scale) — the value
     used to be wider than the hole it was centred in, so it drew over the ring. */
  font: var(--dsw-font-xxxs-strong-11, 600 11px/1 var(--dsw-font-family, system-ui));
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  white-space: nowrap;
}

.dsh-perfmon-gaugeLabel {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, currentColor);
}

.dsh-perfmon-gaugeDetail {
  font-size: 10px;
  color: var(--dsw-alias-label-tertiary, currentColor);
  text-align: center;
  font-variant-numeric: tabular-nums;
  max-inline-size: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* The tag row and the data rows share one template, so every tag is the header
   of the column it orders. The two metric columns are sized to their widest real
   content ("1024.0%" and "999.9 MB · 99%") and never shrink; the name column
   takes the remainder and truncates. */
.dsh-perfmon-columns,
.dsh-perfmon-row {
  display: grid;
  grid-template-columns:
    var(--perfmon-cpu-column, 54px)
    var(--perfmon-mem-column, 88px)
    minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}

.dsh-perfmon-columns {
  padding: 8px 12px 4px;
}

.dsh-perfmon-column {
  display: flex;
  align-items: center;
  min-inline-size: 0;
}

.dsh-perfmon-column--end {
  justify-content: flex-end;
}

.dsh-perfmon-column--start {
  justify-content: flex-start;
}

/* Cancel the button's own padding so its text lines up with the column's edge —
   a header that is merely centred over its column reads as decoration. */
.dsh-perfmon-column--end .dsh-perfmon-tab {
  margin-inline-end: -6px;
}

.dsh-perfmon-column--start .dsh-perfmon-tab {
  margin-inline-start: -6px;
}

.dsh-perfmon-tab {
  font: inherit;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--dsw-radius-sm, 6px);
  border: 0.5px solid transparent;
  background: transparent;
  color: var(--dsw-alias-label-secondary, currentColor);
  white-space: nowrap;
}

.dsh-perfmon-tab:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.12));
}

.dsh-perfmon-tab[aria-pressed='true'] {
  background: var(--dsw-alias-interactive-bg-active, rgba(127, 127, 127, 0.18));
  border-color: var(--dsw-alias-border-l3, rgba(127, 127, 127, 0.3));
  color: var(--dsw-alias-label-primary, currentColor);
  font-weight: 600;
}

.dsh-perfmon-tabArrow {
  margin-inline-start: 3px;
  color: var(--dsw-alias-label-tertiary, currentColor);
}

.dsh-perfmon-filter {
  margin: 6px 12px 0;
  font: inherit;
  font-size: 11px;
  padding: 5px 0;
  border: 0;
  border-block-end: 0.5px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.24));
  background: transparent;
  color: var(--dsw-alias-label-primary, currentColor);
  outline: none;
  inline-size: 100%;
  box-sizing: border-box;
}

.dsh-perfmon-filter::placeholder {
  color: var(--dsw-alias-label-tertiary, currentColor);
}

.dsh-perfmon-rows {
  flex: 1 1 auto;
  min-block-size: 0;
  overflow-y: auto;
  /* A grid item whose content is wider than its track overflows visibly, and an
     overflow-y:auto box computes its other axis to auto as well — that pair is
     what produced a horizontal scrollbar. The tracks are sized so nothing
     overflows, and this keeps either axis from ever appearing. */
  overflow-x: hidden;
  padding: 4px 6px 6px;
}

.dsh-perfmon-row {
  padding: 5px 6px;
  border-radius: var(--dsw-radius-sm, 6px);
}

.dsh-perfmon-row:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.1));
}

.dsh-perfmon-name {
  min-inline-size: 0;
  overflow: hidden;
}

.dsh-perfmon-nameText {
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dsh-perfmon-nameMeta {
  font-size: 10px;
  color: var(--dsw-alias-label-tertiary, currentColor);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-variant-numeric: tabular-nums;
}

.dsh-perfmon-metric {
  display: flex;
  flex-direction: column;
  gap: 3px;
  /* The track is fixed and the content is nowrap: clipping here is what keeps a
     long value from widening the scroller. */
  min-inline-size: 0;
  overflow: hidden;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.dsh-perfmon-metricLine {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 0;
  min-inline-size: 0;
  overflow: hidden;
  white-space: nowrap;
}

.dsh-perfmon-metricValue {
  flex: none;
}

.dsh-perfmon-metricShare {
  flex: 0 1 auto;
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--dsw-alias-label-tertiary, currentColor);
}

.dsh-perfmon-metricBar {
  block-size: 2px;
  border-radius: 999px;
  background: var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.24));
  overflow: hidden;
}

.dsh-perfmon-metricBarFill {
  block-size: 100%;
  border-radius: 999px;
}

.dsh-perfmon-cpuFill {
  background: var(--dsw-alias-brand-primary, #4f6ef7);
}

.dsh-perfmon-memFill {
  background: var(--dsw-alias-state-warn-primary, #d99a2b);
}

.dsh-perfmon-swapFill {
  background: var(--dsw-alias-state-business-primary, #6b7bd6);
}

.dsh-perfmon-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px 8px;
  font-size: 10px;
  color: var(--dsw-alias-label-tertiary, currentColor);
}

.dsh-perfmon-footSpacer {
  margin-inline-start: auto;
}

.dsh-perfmon-action {
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.24));
  border-radius: var(--dsw-radius-sm, 6px);
  background: transparent;
  color: var(--dsw-alias-label-secondary, currentColor);
  padding: 4px 8px;
}

.dsh-perfmon-action:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.12));
}

.dsh-perfmon-notice {
  margin: 10px;
  padding: 8px 10px;
  border-radius: var(--dsw-radius-sm, 6px);
  border: 0.5px solid var(--dsw-alias-state-error-secondary, rgba(200, 80, 80, 0.4));
  background: var(--dsw-alias-bg-layer-2, transparent);
  color: var(--dsw-alias-state-error-primary, currentColor);
  font-size: 11px;
  line-height: 1.5;
}

.dsh-perfmon-notice--muted {
  border-color: var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.24));
  color: var(--dsw-alias-label-secondary, currentColor);
}

.dsh-perfmon-warningList {
  margin: 4px 0 0;
  padding-inline-start: 16px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dsh-perfmon-empty {
  padding: 18px 10px;
  text-align: center;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, currentColor);
}

.dsh-perfmon-headerButton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  block-size: 28px;
  padding: 0 10px;
  border: 0.5px solid transparent;
  border-radius: var(--dsw-radius-sm, 6px);
  background: transparent;
  color: var(--dsw-alias-label-secondary, currentColor);
  white-space: nowrap;
}

.dsh-perfmon-headerButton:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.12));
  color: var(--dsw-alias-label-primary, currentColor);
}

.dsh-perfmon-headerButtonLabel {
  white-space: nowrap;
}
`

/**
 * Install the stylesheet once, tolerating a document that already carries it
 * (two plugin loads in one page, or a hot reload).
 * @returns {() => void} remover that drops the node this call owns.
 */
export function installStyles() {
  if (typeof document === 'undefined') return () => {}
  const existing = document.getElementById(STYLE_ID)
  if (existing !== null) return () => {}
  const node = document.createElement('style')
  node.id = STYLE_ID
  node.textContent = STYLES
  document.head.append(node)
  return () => {
    node.remove()
  }
}

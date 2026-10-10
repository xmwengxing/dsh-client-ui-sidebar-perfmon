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

/* The project-directory line sits under the gauges, inside the resource card.
   The card is a flex column that must keep its own height, so this row is fixed:
   a shrinking child here is the same squeeze that twice bit the search field. */
.dsh-perfmon-disk {
  flex: none;
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 7px 12px 9px;
  border-block-start: 0.5px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.22));
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  min-inline-size: 0;
}

.dsh-perfmon-diskLabel {
  color: var(--dsw-alias-label-secondary, currentColor);
  white-space: nowrap;
}

.dsh-perfmon-diskValue {
  font-weight: 600;
  white-space: nowrap;
}

/* The no-answer-yet spinner: a quarter arc that turns inside the value's box,
   so the row's height and baseline stay exactly the same as when a size shows. */
.dsh-perfmon-diskSpinner {
  box-sizing: border-box;
  inline-size: 11px;
  block-size: 11px;
  border: 1.5px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.24));
  border-block-start-color: var(--dsw-alias-brand-primary, #4f6ef7);
  border-radius: 50%;
  animation: dsh-perfmon-spin 0.9s linear infinite;
  align-self: center;
}

@keyframes dsh-perfmon-spin {
  to {
    transform: rotate(360deg);
  }
}

.dsh-perfmon-diskDetail {
  color: var(--dsw-alias-label-tertiary, currentColor);
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsh-perfmon-diskAction {
  flex: none;
  margin-inline-start: auto;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.24));
  border-radius: var(--dsw-radius-sm, 6px);
  background: var(--dsw-alias-bg-layer-2, transparent);
  color: var(--dsw-alias-label-secondary, currentColor);
  font-size: 10px;
  line-height: 1;
  padding: 3px 8px;
  cursor: pointer;
  white-space: nowrap;
}

.dsh-perfmon-diskAction:hover {
  color: var(--dsw-alias-label-primary, currentColor);
  border-color: var(--dsw-alias-border-l3, rgba(127, 127, 127, 0.34));
}

/* The GPU bar: one row split into two halves, the clock on the left and VRAM on
   the right. Like the folder row it is fixed (flex: none), because a shrinking
   child inside the card's flex column is the squeeze that twice bit the search
   field.

   Layout rule: wrap, never overflow. Each half declares a flex basis of the
   width it actually needs (roughly label + a "868 MB / 11.0 GB" value). On a
   normal sidebar both halves share one line, which is the single bar the row
   was asked for. When the panel is genuinely too narrow for two, the second
   half wraps onto its own line and takes the full width — a stacked pair still
   showing both numbers, rather than a clipped value.

   The tracks clip (overflow: hidden) and every box carries a zero minimum, so a
   long value can never widen the row past the card's edge: the failure this
   replaces was bare text running out of the card's left side. */
.dsh-perfmon-gpuRow {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  padding: 7px 12px 9px;
  border-block-start: 0.5px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.22));
  font-size: 11px;
  min-inline-size: 0;
}

.dsh-perfmon-gpuMetric {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 135px;
  min-inline-size: 0;
}

.dsh-perfmon-gpuMetricLabel {
  color: var(--dsw-alias-label-secondary, currentColor);
  white-space: nowrap;
  flex: none;
}

/* The track reserves the whole column and paints the fill behind the text, so a
   long value never needs extra width and the row never changes height. */
.dsh-perfmon-gpuMetricTrack {
  position: relative;
  display: flex;
  align-items: center;
  block-size: 17px;
  border-radius: var(--dsw-radius-sm, 6px);
  background: var(--dsw-alias-bg-layer-2, rgba(127, 127, 127, 0.10));
  overflow: hidden;
  flex: 1 1 auto;
  min-inline-size: 0;
}

/* The fill is decorative only: never let it intercept the row's tooltip. */
.dsh-perfmon-gpuMetricFill {
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  opacity: 0.2;
  pointer-events: none;
  transition: inline-size 0.3s ease;
}

.dsh-perfmon-gpuMetricValue {
  position: relative;
  color: var(--dsw-alias-label-primary, currentColor);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-inline: 7px;
  min-inline-size: 0;
}

/* The tag row and the data rows share one template, so every tag is the header
   of the column it orders. The two metric columns are sized to their widest real
   content ("1024.0%" and "999.9 MB · 99%") and never shrink; the name column
   takes the remainder and truncates. */
/* The three tracks. The two fixed ones are resizable through the grips in the
   header; the name track takes whatever is left. The gutter is padding inside the
   cells rather than a grid gap, so the divider between two columns can sit exactly
   on their boundary. */
.dsh-perfmon-columns,
.dsh-perfmon-row {
  display: grid;
  grid-template-columns:
    var(--perfmon-cpu-column, 54px)
    var(--perfmon-mem-column, 88px)
    minmax(0, 1fr);
  align-items: center;
  gap: 0;
  padding-inline: 4px;
}

/* A hairline on every cell but the last: that is what turns three cramped
   numbers into three readable columns at any width. */
.dsh-perfmon-columns > *:not(:last-child),
.dsh-perfmon-row > *:not(:last-child) {
  border-inline-end: 0.5px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.22));
}

.dsh-perfmon-columns > *,
.dsh-perfmon-row > * {
  padding-inline: 8px;
}

.dsh-perfmon-columns {
  padding-block: 8px 4px;
}

/* Rows are separated too: a dense list needs the reader's eye guided across, not
   just down. */
.dsh-perfmon-row + .dsh-perfmon-row {
  border-block-start: 0.5px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.16));
}

.dsh-perfmon-column {
  position: relative;
  display: flex;
  align-items: center;
  min-inline-size: 0;
}

/* The divider's hit area. It sits inside the gutter on both sides so it never
   covers the header text, and it is tall enough to grab without aiming. */
.dsh-perfmon-columnGrip {
  position: absolute;
  inset-block: -3px;
  inset-inline-end: -7px;
  inline-size: 14px;
  z-index: 1;
  border-radius: 2px;
  cursor: col-resize;
  touch-action: none;
  outline-offset: 1px;
}

.dsh-perfmon-columnGrip::after {
  content: '';
  position: absolute;
  inset-block: 3px;
  inset-inline-start: 6px;
  inline-size: 2px;
  border-radius: 1px;
  background: transparent;
}

.dsh-perfmon-columnGrip:hover::after,
.dsh-perfmon-columnGrip:focus-visible::after,
.dsh-perfmon-columnGrip:active::after {
  background: var(--dsw-alias-brand-primary, #4f6ef7);
}

.dsh-perfmon-columnGrip:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, rgba(79, 110, 247, 0.5));
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

/* The search field: a bordered, filled control with its own magnifier and clear
   button. It has to look like an input at a glance — the panel's own filter used
   to be a bare underline that read as a static label. */
.dsh-perfmon-search {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 6px 12px 4px;
  padding: 0 8px;
  block-size: 26px;
  min-block-size: 26px;
  /* A flex item would otherwise shrink below its block-size when the card is
     tight, which made the field 22px when empty and 26px once it had a clear
     button — a visible jump. It is a fixed control, not a flexible one. */
  flex: none;
  box-sizing: border-box;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.3));
  border-radius: var(--dsw-radius-sm, 6px);
  background: var(--dsw-alias-bg-layer-2, rgba(127, 127, 127, 0.06));
  color: var(--dsw-alias-label-tertiary, currentColor);
}

.dsh-perfmon-search:focus-within {
  border-color: var(--dsw-alias-brand-primary, #4f6ef7);
  box-shadow: 0 0 0 2px var(--dsw-focus-ring-color, rgba(79, 110, 247, 0.3));
  color: var(--dsw-alias-label-secondary, currentColor);
}

.dsh-perfmon-searchIcon {
  display: flex;
  flex: none;
  align-items: center;
}

.dsh-perfmon-filter {
  flex: 1 1 auto;
  min-inline-size: 0;
  font: inherit;
  font-size: 11px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-primary, currentColor);
  outline: none;
}

.dsh-perfmon-filter::placeholder {
  color: var(--dsw-alias-label-tertiary, currentColor);
}

/* The native search decoration would sit next to our own clear control. */
.dsh-perfmon-filter::-webkit-search-cancel-button,
.dsh-perfmon-filter::-webkit-search-decoration {
  -webkit-appearance: none;
  appearance: none;
}

.dsh-perfmon-searchClear {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  inline-size: 16px;
  block-size: 16px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, currentColor);
  cursor: pointer;
}

.dsh-perfmon-searchClear:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.14));
  color: var(--dsw-alias-label-primary, currentColor);
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
  padding: 4px 0 6px;
}

.dsh-perfmon-row {
  padding-block: 5px;
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

/* The temperature card sits under the resource card. Like it, it keeps the height
   its content needs: in a short pane the process list is what gives way, never
   these four tiles. Two columns rather than four: a four-across row leaves each
   tile about 90px in a normal Sidebar, which fits "27.9°C" but not the English
   labels ("Motherboard"), and a label that wraps or truncates is worse than the
   extra row. */
.dsh-perfmon-temps {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px;
  padding: 8px 12px 10px;
  flex: 0 0 auto;
}

/* A tile is two lines: the reading, then the component. The detail the third
   line used to carry lives in the tooltip — the card read as mostly whitespace
   at three lines for what is two short strings. */
.dsh-perfmon-temp {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 5px 6px;
  min-inline-size: 0;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.24));
  border-radius: var(--dsw-radius-sm, 6px);
  background: var(--dsw-alias-bg-layer-2, rgba(127, 127, 127, 0.06));
  /* The tile is a fixed control: without this a tight card squeezes it and the
     reading collides with the label. */
  flex: none;
}

.dsh-perfmon-tempValue {
  font: var(--dsw-font-sm-strong-13, 600 13px/1.2 var(--dsw-font-family, system-ui));
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--dsw-alias-label-primary, currentColor);
}

.dsh-perfmon-tempUnit {
  margin-inline-start: 1px;
  font-size: 10px;
  font-weight: 400;
  color: var(--dsw-alias-label-tertiary, currentColor);
}

.dsh-perfmon-tempLabel {
  font-size: 11px;
  line-height: 1.3;
  color: var(--dsw-alias-label-secondary, currentColor);
  white-space: nowrap;
  max-inline-size: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Three tones, each a border and a value colour rather than a filled block: a
   filled tile at four across would shout, and the reading has to stay the thing
   the eye lands on. The unknown tone is the plain card border. */
.dsh-perfmon-temp--cool {
  border-color: var(--dsw-alias-state-success-secondary, rgba(80, 170, 120, 0.4));
}

.dsh-perfmon-temp--cool .dsh-perfmon-tempValue {
  color: var(--dsw-alias-state-success-primary, currentColor);
}

.dsh-perfmon-temp--warm {
  border-color: var(--dsw-alias-state-warn-secondary, rgba(217, 154, 43, 0.5));
}

.dsh-perfmon-temp--warm .dsh-perfmon-tempValue {
  color: var(--dsw-alias-state-warn-primary, currentColor);
}

.dsh-perfmon-temp--hot {
  border-color: var(--dsw-alias-state-error-secondary, rgba(200, 80, 80, 0.5));
}

.dsh-perfmon-temp--hot .dsh-perfmon-tempValue {
  color: var(--dsw-alias-state-error-primary, currentColor);
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

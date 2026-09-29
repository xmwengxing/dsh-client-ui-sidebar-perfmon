/**
 * The perfmon glyph: a heartbeat trace, drawn in `currentColor` so the guide
 * capsule and the header button tint it themselves.
 *
 * The element tree is built with an explicit `createElement` import rather than
 * with JSX, so the component never depends on an ambient `React` binding: the
 * browser bundle happens to provide one, a test bundle does not.
 *
 * @module dsh-client-ui-sidebar-perfmon/Icon
 */

import { createElement as h } from 'react'

/**
 * Render the monitor glyph.
 * @param {{size?: number, className?: string}} props - the shared icon props.
 * @returns {import('react').ReactNode} a decorative inline SVG.
 */
export function PerfmonIcon({ size = 16, className }) {
  return h(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 16 16',
      fill: 'none',
      className,
      'aria-hidden': 'true',
      focusable: 'false',
    },
    h('rect', { x: 1.25, y: 2.25, width: 13.5, height: 9, rx: 1.75, stroke: 'currentColor', strokeWidth: 1.1 }),
    h('path', {
      d: 'M3.2 8.1h2.1l1.05-2.4 1.5 4.3 1.15-2.6h2.4',
      stroke: 'currentColor',
      strokeWidth: 1.1,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
    h('path', { d: 'M5.5 13.4h5', stroke: 'currentColor', strokeWidth: 1.1, strokeLinecap: 'round' }),
  )
}

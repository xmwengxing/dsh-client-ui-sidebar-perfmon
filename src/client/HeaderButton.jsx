/**
 * The header control: one button beside the Session utilities that opens the
 * perfmon page in the right Sidebar.
 *
 * It lives in `conversation.session.header.utilities` — the list seat the
 * Session log export already extends — and registers with the highest order so
 * it lands at the row's right edge, immediately beside the Sidebar's own expand
 * button. The corner seat itself is single-occupancy and belongs to
 * `ui-sidebar-right`, so extending the utilities row is the way to sit next to
 * that control without taking it over.
 *
 * @module dsh-client-ui-sidebar-perfmon/HeaderButton
 */

import { createElement as h } from 'react'
import { PerfmonIcon } from './Icon.jsx'

/**
 * Render the header button.
 *
 * The session-scoped seat injects `sessionId` — the session whose header row
 * the button sits in — and it is carried to the perfmon page so its folder
 * meter knows which workspace the user is looking at.
 * @param {object} props - the injected face.
 * @param {string} [props.sessionId] - the session this header row belongs to.
 * @param {() => void} props.open - open (or focus) the perfmon page.
 * @param {(key: string, values?: object) => string} props.t - translator.
 * @returns {import('react').ReactNode} the button.
 */
export function HeaderButton({ sessionId, open, t }) {
  const label = t('headerButton')
  return h(
    'button',
    {
      type: 'button',
      className: 'dsh-perfmon-headerButton',
      title: t('headerButtonOpen'),
      'aria-label': t('headerButtonOpen'),
      onClick: () => {
        open(sessionId)
      },
    },
    h(PerfmonIcon, { size: 15 }),
    h('span', { className: 'dsh-perfmon-headerButtonLabel' }, label),
  )
}

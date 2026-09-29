/**
 * perfmon browser half: the tab type, its body, and the header control.
 *
 * Three registration surfaces, all of them public extension seats:
 *
 * 1. `ctx.sidebarRightTabs.register()` declares the `perfmon` page type and its
 *    guide entry, which is what puts a card on the right Sidebar's guide page.
 * 2. `ctx.slots.register()` under `sidebar.right.pane.tab`, keyed by this type's
 *    `id`, supplies the body that renders for every perfmon tab.
 * 3. `ctx.slots.register()` under `conversation.session.header.utilities` adds
 *    the button beside the Sidebar's expand control.
 *
 * Service resolution is deliberately late. The plugin declares no `inject` list
 * and reaches each service through `ctx.inject([...])` instead, so a surface that
 * is absent (a profile without the right Sidebar, or without Connection) simply
 * never registers its contribution, rather than leaving the whole plugin pending
 * on a dependency it cannot outlive.
 *
 * @module @xmwengxing/dsh-client-ui-sidebar-perfmon/client
 */

import { createTranslator } from './copy.js'
import { installStyles } from './styles.js'
import { PerfmonBody } from './PerfmonBody.jsx'
import { HeaderButton } from './HeaderButton.jsx'
import { SNAPSHOT_PATH } from './api.js'

/** Stable Cordis plugin name; the loader also keys the client bundle by it. */
export const name = '@xmwengxing/dsh-client-ui-sidebar-perfmon'

/** This implementation's identity in the tab system, and the key of its body slot. */
export const PERFMON_TYPE_ID = '@xmwengxing/dsh-client-ui-sidebar-perfmon'

/** The tab kind the guide entry and the header button open. */
export const PERFMON_KIND = 'perfmon'

/** Ascending guide order: after the shipped terminal entry (`order: 20`). */
const GUIDE_ORDER = 30

/** Highest utilities order, so the button sits at the row's right edge. */
const HEADER_ORDER = 100

/**
 * Register the perfmon surfaces.
 * @param {import('@deepseek-ai/cordis').Context} ctx - the client plugin context.
 */
export function apply(ctx) {
  const t = createTranslator()

  ctx.effect(() => installStyles(), 'perfmon: stylesheet')

  ctx.inject(['slots'], (ui) => {
    // The header control. Its whole injected face is handed to the component, so
    // every prop the component destructures has to be listed here — a missing one
    // is not a type error at this boundary, it is a render crash, and a crashing
    // entry is retired by the slot framework rather than reported.
    //
    // `sidebarRight` is resolved at click time so the button can register even
    // when the navigation service arrives later, and a missing service leaves a
    // no-op rather than a thrown wiring error.
    ui.slots.inject('conversation.session.header.utilities', () =>
      ui.slots.register(
        {
          name: 'conversation.session.header.utilities',
          id: PERFMON_TYPE_ID,
          order: HEADER_ORDER,
          inject: () => ({
            t,
            open: () => {
              try {
                ctx.get('sidebarRight')?.openTab(PERFMON_KIND)
              } catch (error) {
                ctx.logger?.warn?.('perfmon: could not open the monitor page: %s', error?.message ?? String(error))
              }
            },
          }),
        },
        HeaderButton,
      ),
    )

    // The page type and its guide entry.
    ui.inject(['sidebarRightTabs'], (tabs) => {
      tabs.effect(
        () =>
          tabs.sidebarRightTabs.register({
            id: PERFMON_TYPE_ID,
            kind: PERFMON_KIND,
            priority: 'extension',
            title: () => t('tabTitle'),
            guide: [
              {
                id: PERFMON_KIND,
                order: GUIDE_ORDER,
                title: () => t('title'),
                description: () => t('description'),
              },
            ],
          }),
        'perfmon: tab type',
      )
    })

    // The tab body.
    ui.slots.inject('sidebar.right.pane.tab', () =>
      ui.slots.register(
        {
          name: 'sidebar.right.pane.tab',
          key: PERFMON_TYPE_ID,
          inject: () => ({ t }),
        },
        PerfmonBody,
      ),
    )
  })
}

export { SNAPSHOT_PATH }

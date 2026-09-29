/**
 * Test-only entry: re-exports the internals the behavioral specs drive.
 *
 * This file is not part of the published package (`files` excludes `test/`), so
 * the plugin's public face — `apply`, `inject` and the identity constants —
 * stays exactly as narrow as the client plugin rules require.
 *
 * @module dsh-client-ui-sidebar-perfmon/test-support
 */

export { PerfmonBody } from '../../src/client/PerfmonBody.jsx'
export { ProcessPanel, SORT_TAGS } from '../../src/client/ProcessPanel.jsx'
export { GaugePanel } from '../../src/client/GaugePanel.jsx'
export { HeaderButton } from '../../src/client/HeaderButton.jsx'
export { PerfmonIcon } from '../../src/client/Icon.jsx'
export { createTranslator, describeState, resolveLanguage } from '../../src/client/copy.js'
export { formatBytes, formatPercent, formatDuration, formatClock, barWidth } from '../../src/client/format.js'
export { SNAPSHOT_PATH } from '../../src/client/api.js'

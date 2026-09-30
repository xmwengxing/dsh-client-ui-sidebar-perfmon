/**
 * One-shot probe: prove the face the workspace meter reads.
 *
 * Boots the real @deepseek-ai/dsh-session store beside the *running* dsh
 * installation, creates a session the way the harness does (`meta.cwd`),
 * and prints what `ctx.sessions.list()` then reports — the exact call
 * `src/host/index.js` makes on every poll. Read-only for the host's own data;
 * the probe's session lives only in this process. Usage:
 *
 *   node scripts/probe-sessions.mjs
 */

import { pathToFileURL } from 'node:url'
import { delimiter, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { access, realpath } from 'node:fs/promises'

const root = resolve(dirname(new URL(import.meta.url).pathname), '..')
const require = createRequire(import.meta.url)

/** Locate the installed @deepseek-ai/dsh package the way the contract specs do. */
async function cliRoot() {
  for (const entry of (process.env.PATH ?? '').split(delimiter)) {
    if (entry === '') continue
    try {
      const real = await realpath(join(entry, 'dsh'))
      const candidate = resolve(dirname(real), '..')
      await access(join(candidate, 'package.json'))
      return candidate
    } catch {
      // not this one
    }
  }
  return undefined
}

const cli = await cliRoot()
const base = cli !== undefined ? join(cli, 'node_modules/@deepseek-ai') : '@deepseek-ai'

const sessionUrl = pathToFileURL(require.resolve(join(base, 'dsh-session'), { paths: [root, cli ?? root] }))
const sessionModule = await import(sessionUrl.href)
const SessionStore = sessionModule.SessionStore

const { Context } = await import('@deepseek-ai/cordis')

const host = new Context()
host.plugin(SessionStore)
await new Promise((r) => setTimeout(r, 3000))

try {
  const before = host.sessions.list()
  console.log('live sessions before:', before.length)

  // Create sessions the way the harness does: one per workspace.
  const created = []
  for (const cwd of [root, process.env.HOME ?? '/tmp']) {
    created.push(host.sessions.create(undefined, { meta: { cwd } }))
  }
  const list = host.sessions.list()
  console.log('live sessions after create:', list.length)
  for (const session of list) {
    console.log('-', session.id, 'cwd =', session.header.cwd)
  }

  // Exactly what src/host/index.js feeds the workspace meter.
  const cwds = list.map((session) => session?.header?.cwd)
  console.log('meter input (dedup):', [...new Set(cwds.map((cwd) => (typeof cwd === 'string' ? resolve(cwd) : cwd)))])

  for (const session of created) {
    try {
      session.dispose?.()
    } catch {
      // the fiber teardown below owns these too
    }
  }
} catch (error) {
  console.log('probe failed:', error?.message ?? String(error))
}

setTimeout(() => process.exit(0), 800)

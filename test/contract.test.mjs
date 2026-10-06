/**
 * Contract-currency specs.
 *
 * The plugin talks to dsh through string-keyed extension points — slot names,
 * Cordis service names, an `/api` route path — and every one of those is a
 * silent failure when it is wrong: a mistyped slot never fires, a mistyped
 * service never activates, and a bad path throws only at boot.
 *
 * These specs read the installed dsh packages and assert the strings this plugin
 * uses are still the strings the framework declares. They are the tripwire for an
 * upstream rename, and they are deliberately allowed to fail loudly rather than
 * skipped: a missing package means the contract can no longer be checked.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, access, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

/**
 * Locate the dsh installation the contracts are checked against.
 *
 * `DSH_CLI_ROOT` wins when set; otherwise the `dsh` executable on `PATH` is the
 * authority, because that is the installation that will actually load the plugin.
 * @returns {Promise<string | undefined>} the `@deepseek-ai/dsh` package directory.
 */
async function installedCliRoot() {
  const declared = process.env.DSH_CLI_ROOT
  if (declared !== undefined && declared !== '') return declared
  const extensions = process.platform === 'win32' ? ['.cmd', '.exe', ''] : ['']
  for (const entry of (process.env.PATH ?? '').split(delimiter)) {
    if (entry === '') continue
    for (const extension of extensions) {
      try {
        const real = await realpath(join(entry, `dsh${extension}`))
        const candidate = resolve(dirname(real), '..')
        await access(join(candidate, 'package.json'))
        return candidate
      } catch {
        // not this one
      }
    }
  }
  return undefined
}

/**
 * Resolve a dsh package, preferring the copy the running installation uses.
 *
 * A plugin is developed against the same dsh that will load it, so the spec looks
 * for the packages beside the installed CLI and only then falls back to a local
 * install.
 * @param {string} name - the package name to resolve.
 * @returns {Promise<string>} the package directory.
 */
async function packageDir(name) {
  const candidates = []
  try {
    candidates.push(dirname(require.resolve(`${name}/package.json`)))
  } catch {
    // not resolvable from this package — try the installed CLI below
  }
  const cli = await installedCliRoot()
  if (cli !== undefined) {
    candidates.push(join(cli, 'node_modules/@deepseek-ai', name.replace('@deepseek-ai/', '')))
  }
  for (const candidate of candidates) {
    try {
      await access(join(candidate, 'package.json'))
      return candidate
    } catch {
      // try the next candidate
    }
  }
  throw new Error(`cannot resolve ${name}; set DSH_CLI_ROOT to the installed @deepseek-ai/dsh directory`)
}

/** Read a file, or the empty string when the layout moved and it is gone. */
async function readIfPresent(path) {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return ''
  }
}

test('the sidebar seats this plugin registers into still exist', async () => {
  const sidebar = await packageDir('@deepseek-ai/dsh-client-ui-sidebar-right')
  const contract = await readFile(
    join(sidebar, 'lib/types/client/contract/slots.d.ts'),
    'utf8',
  )
  for (const seat of ['sidebar.right.pane.tab', 'sidebar.right.tab.guide.entry']) {
    assert.ok(contract.includes(`'${seat}'`), `sidebar-right no longer declares ${seat}`)
  }
  // The type registry and the navigation service are what the plugin injects.
  const service = await readFile(join(sidebar, 'lib/types/client/service.d.ts'), 'utf8')
  assert.ok(service.includes('openTab'), 'the Sidebar navigation service no longer exposes openTab')
  assert.ok(service.includes('isExpanded'), 'the Sidebar navigation service changed shape')
})

test('the header utilities seat this plugin extends still exists', async () => {
  const conversation = await packageDir('@deepseek-ai/dsh-client-ui-conversation')
  const contract = await readFile(join(conversation, 'lib/types/client/contract/slots.d.ts'), 'utf8')
  assert.ok(
    contract.includes("'conversation.session.header.utilities'"),
    'ui-conversation no longer declares the header utilities seat',
  )
  // A list seat is what makes appending legal; a single seat would be a takeover.
  const seat = contract.slice(contract.indexOf("'conversation.session.header.utilities'"))
  assert.match(seat.slice(0, 200), /kind: 'list'/, 'the utilities seat is no longer a list seat')
})

test('the plugin bundle id matches the package name the loader validates', async () => {
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const bundle = await readFile(join(root, 'client/client.js'), 'utf8')
  assert.ok(
    bundle.includes(`id: ${JSON.stringify(manifest.name)}`),
    'the client bundle id must equal the package name',
  )
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  // The loader requires a ./client export for any package declaring dsh.client.
  assert.ok('./client' in manifest.exports, 'dsh.client requires a ./client export')
})

test('the snapshot route satisfies the connection path rule', async () => {
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const host = await readFile(join(root, manifest.main), 'utf8')
  const path = host.match(/SNAPSHOT_PATH\s*=\s*"([^"]+)"/)?.[1]
  assert.equal(path, '/api/perfmon.snapshot')

  // `assertFetchRoute` admits only `/api/<segment>…` with these characters, and
  // the shared handler dispatches on the exact pathname.
  const connection = await packageDir('@deepseek-ai/dsh-client-connection')
  const source = await readFile(join(connection, 'lib/index.js'), 'utf8')
  const pattern = source.match(/ENDPOINT_SEGMENT_PATTERN\s*=\s*(\/\^.*?\/)/)?.[1]
  assert.ok(pattern !== undefined, 'the connection endpoint pattern moved; re-check the route rule')
  const segmentPattern = new RegExp(pattern.slice(1, -1))
  assert.ok(path.startsWith('/api/'), 'the route must live under the authenticated /api channel')
  for (const segment of path.slice('/api/'.length).split('/')) {
    assert.ok(segmentPattern.test(segment), `segment ${segment} is rejected by the connection rule`)
  }
  assert.match(source, /path: channel/, 'the connection no longer mounts the channel as a prefix route')
})

test('the browser half only reaches services that the web profile provides', async () => {
  const bundle = await readFile(join(root, 'client/client.js'), 'utf8')
  // Every service name the browser half asks for must be a service the shipped
  // web client provides, or the contribution would wait forever.
  for (const service of ['slots', 'sidebarRight', 'sidebarRightTabs']) {
    assert.ok(bundle.includes(JSON.stringify(service)) || bundle.includes(`'${service}'`), `unused: ${service}`)
  }
  const sidebar = await packageDir('@deepseek-ai/dsh-client-ui-sidebar-right')
  const shell = await readFile(join(sidebar, 'lib/client.js'), 'utf8')
  for (const service of ['sidebarRight', 'sidebarRightTabs']) {
    assert.ok(shell.includes(`"${service}"`), `sidebar-right no longer provides ${service}`)
  }
  // The slot runtime the plugin registers through must still be a client half.
  const conversation = await packageDir('@deepseek-ai/dsh-client-ui-conversation')
  const conversationClient = await readFile(join(conversation, 'lib/client.js'), 'utf8')
  assert.ok(conversationClient.length > 0, 'ui-conversation client half is missing')
})

test('every package the manifest injects ships a client module the loader serves', async () => {
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const inject = manifest.dsh?.client?.inject ?? []
  assert.ok(inject.length > 0, 'the manifest declares no client injects to check')
  for (const name of inject) {
    // The client loader registers each injected package before its consumer, so
    // a types-only dependency (no lib/client.js) leaves this plugin registered
    // but never applied — no panel, no log, no error anywhere.
    const dir = await packageDir(name)
    try {
      await access(join(dir, 'lib', 'client.js'))
    } catch {
      throw new Error(
        `${name} ships no client module; the loader would never apply this plugin. ` +
          'Remove it from dsh.client.inject or point the manifest at what loads.',
      )
    }
  }
})

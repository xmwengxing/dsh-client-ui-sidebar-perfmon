/**
 * The browser half is loaded exactly the way the client module system loads it:
 * the built `client/client.js` runs against a stubbed `window.__ModuleLoader__`,
 * and its exported `apply` is handed a recording context. That covers what a
 * typecheck cannot — that the shipped artifact parses, exports the right face,
 * and registers into the right seats with the right keys.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const require = createRequire(import.meta.url)

/**
 * Evaluate the shipped client bundle and return its module exports.
 * @returns {Promise<object>} the module the loader registered.
 */
async function loadClientBundle() {
  const source = await readFile(resolve(root, 'client/client.js'), 'utf8')
  let registration
  const window = {
    __ModuleLoader__: {
      load(value) {
        registration = value
      },
    },
  }
  // The bundle is a classic script by design: it talks to `window` and nothing else.
  const evaluate = new Function('window', 'require', `${source}\nreturn undefined;`)
  evaluate(window, (specifier) => {
    if (specifier === 'react') return require('react')
    throw new Error(`unexpected external request: ${specifier}`)
  })
  assert.ok(registration, 'the bundle must call window.__ModuleLoader__.load')
  return registration.factory((specifier) => {
    if (specifier === 'react') return require('react')
    throw new Error(`unexpected external request: ${specifier}`)
  })
}

/**
 * A Cordis-shaped recording context, reduced to what this plugin touches.
 *
 * Derived contexts inherit from their parent exactly as Cordis ones do — a
 * service read on the root is visible to a context produced by `inject` — so the
 * mock cannot pass where the real framework would fail on a missing service.
 * @returns {object} the context and the registrations it captured.
 */
function createRecordingContext() {
  const captured = {
    effects: [],
    injected: [],
    slotInjections: [],
    slotRegistrations: [],
    tabTypes: [],
    services: new Map(),
  }

  /** Build a context whose `inject`/`effect`/`slots` record their use. */
  const makeContext = (label, parent) => {
    const scope = Object.create(parent ?? null)
    scope.label = label
    scope.effect = (callback, name) => {
      const disposer = callback()
      captured.effects.push({ name, label, disposer })
      return typeof disposer === 'function' ? disposer : () => {}
    }
    scope.inject = (dependencies, callback) => {
      captured.injected.push({ label, dependencies })
      return callback(makeContext(`${label}>inject(${dependencies.join(',')})`, scope))
    }
    scope.get = (name) => captured.services.get(name)
    scope.logger = { warn() {} }
    scope.slots = {
      inject(name, callback) {
        captured.slotInjections.push({ label, name })
        return callback()
      },
      register(definition, component) {
        captured.slotRegistrations.push({ definition, component })
        return () => {}
      },
    }
    return scope
  }

  return { ctx: makeContext('root', null), captured }
}

/**
 * Load the shipped bundle and apply it to a recording context that already
 * provides the tab-type registry, which the plugin waits on.
 * @returns {Promise<{module: object, ctx: object, captured: object}>} the apply result.
 */
async function applyBundle() {
  const module = await loadClientBundle()
  const { ctx, captured } = createRecordingContext()
  ctx.sidebarRightTabs = {
    register(definition) {
      captured.tabTypes.push(definition)
      return () => {}
    },
  }
  captured.services.set('sidebarRightTabs', ctx.sidebarRightTabs)
  module.apply(ctx)
  return { module, ctx, captured }
}

test('the client bundle registers its three surfaces', async () => {
  const { module, captured } = await applyBundle()
  assert.equal(module.name, '@xmwengxing/dsh-client-ui-sidebar-perfmon')
  assert.equal(typeof module.apply, 'function')

  // 1. The tab type and its guide entry.
  assert.equal(captured.tabTypes.length, 1)
  const type = captured.tabTypes[0]
  assert.equal(type.id, module.PERFMON_TYPE_ID)
  assert.equal(type.kind, 'perfmon')
  assert.equal(type.priority, 'extension')
  assert.equal(typeof type.title(), 'string')
  assert.equal(type.guide.length, 1)
  assert.equal(type.guide[0].id, 'perfmon')
  assert.equal(typeof type.guide[0].title(), 'string')
  assert.equal(typeof type.guide[0].description(), 'string')

  // 2. The tab body, keyed by the type's own id, and the header control.
  const slots = captured.slotRegistrations.map((entry) => entry.definition.name).sort()
  assert.deepEqual(slots, ['conversation.session.header.utilities', 'sidebar.right.pane.tab'])

  const body = captured.slotRegistrations.find((entry) => entry.definition.name === 'sidebar.right.pane.tab')
  assert.equal(body.definition.key, module.PERFMON_TYPE_ID)
  assert.equal(typeof body.component, 'function')
  assert.equal(typeof body.definition.inject().t, 'function')

  const header = captured.slotRegistrations.find(
    (entry) => entry.definition.name === 'conversation.session.header.utilities',
  )
  assert.equal(header.definition.id, module.PERFMON_TYPE_ID)
  assert.equal(typeof header.component, 'function')
  assert.ok(header.definition.order > 0, 'the header control must carry an explicit order')

  // The body is registered only once the tab seat is declared, and the type only
  // once the registry service exists.
  assert.deepEqual(
    captured.slotInjections.map((entry) => entry.name).sort(),
    ['conversation.session.header.utilities', 'sidebar.right.pane.tab'],
  )
  assert.deepEqual(captured.injected.map((entry) => entry.dependencies).flat(), ['slots', 'sidebarRightTabs'])

  // 3. The header control opens the page through the navigation service.
  const opened = []
  captured.services.set('sidebarRight', {
    openTab(kind) {
      opened.push(kind)
    },
  })
  header.definition.inject().open()
  assert.deepEqual(opened, ['perfmon'])

  // A missing navigation service is a no-op, never a thrown wiring error.
  captured.services.delete('sidebarRight')
  assert.doesNotThrow(() => {
    header.definition.inject().open()
  })
})

/**
 * Blank out every `var(...)` group, which the bundle uses in stylesheets and in
 * inline `stroke`/`background` values alike.
 *
 * A regex cannot do this: the fallback inside a `var()` is usually itself a
 * function call (`rgba(…)`), so the group has to be found by balancing parens.
 * @param {string} source - the text to strip.
 * @returns {string} the same text with every `var()` group removed.
 */
function stripVarGroups(source) {
  let out = ''
  let index = 0
  while (index < source.length) {
    const start = source.indexOf('var(', index)
    if (start < 0) {
      out += source.slice(index)
      break
    }
    out += source.slice(index, start)
    let depth = 0
    let cursor = start + 3
    for (; cursor < source.length; cursor += 1) {
      const character = source[cursor]
      if (character === '(') depth += 1
      else if (character === ')') {
        depth -= 1
        if (depth === 0) break
      }
    }
    index = cursor + 1
  }
  return out
}

test('every registered component renders from its own injected face', async () => {
  // A registration carries the whole prop surface its component receives, so a
  // prop the component destructures but the face omits is a render crash — and a
  // crashing entry is retired by the slot framework, which looks exactly like a
  // registration that never happened. Rendering each entry against its own face
  // is the only place that gap is visible without a browser.
  const { captured } = await applyBundle()

  const React = require('react')
  const TestRenderer = require('react-test-renderer')
  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  assert.ok(captured.slotRegistrations.length > 0, 'the plugin registered at least one entry')
  for (const { definition, component } of captured.slotRegistrations) {
    assert.equal(typeof definition.inject, 'function', `${definition.name} must expose an inject face`)
    const face = definition.inject('session-fixture')
    let renderer
    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(React.createElement(component, face))
    })
    assert.ok(renderer.toJSON() !== null, `${definition.name} rendered nothing`)
    renderer.unmount()
  }
})

test('the header control receives the translator its label needs', async () => {
  const { captured } = await applyBundle()
  const header = captured.slotRegistrations.find(
    (entry) => entry.definition.name === 'conversation.session.header.utilities',
  )
  const face = header.definition.inject()
  assert.equal(typeof face.t, 'function', 'the face must carry `t`: the component destructures it')
  assert.equal(typeof face.open, 'function')
  assert.equal(face.t('headerButton'), '性能监控信息', 'and it must be the plugin translator')
})

test('every colour in the sheet resolves through a design token', async () => {
  const module = await loadClientBundle()
  const source = await readFile(resolve(root, 'client/client.js'), 'utf8')

  // The stylesheet is inlined in the bundle; take it from the shipped text rather
  // than importing an internal, which is not part of the public face.
  const sheet = source.slice(source.indexOf('.dsh-perfmon-root'))
  assert.match(sheet, /dsh-perfmon-root/)

  // A literal colour is allowed only as a `var()` fallback — never as the value a
  // rule actually paints with.
  const literals = stripVarGroups(sheet).match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^()]*\)/g) ?? []
  assert.deepEqual(literals, [], 'no bare colour may appear outside a var() fallback')
  assert.match(source, /var\(--dsw-alias-/)
  assert.equal(module.SNAPSHOT_PATH, '/api/perfmon.snapshot')
})

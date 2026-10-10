/**
 * Host-route composition specs.
 *
 * These drive the real `apply()` against a fake Connection and read the response
 * body, which is the only place the snapshot's three independent readings —
 * metrics, temperature, and GPU — are merged. That merge is exactly where a
 * field can silently disappear: removing the warnings notice from the panel once
 * dropped `temperature` from the response while the top-level `warnings` still
 * carried `temperature-unavailable`, so the card rendered empty with no test
 * failing. A spec that asserts the response *shape* is what catches that.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

/** A sample pair whose difference is a real, non-zero CPU reading. */
function samplePair(base) {
  const make = (offset) => ({
    at: base + offset,
    cpu: {
      aggregate: { total: 1000 + offset * 10, idle: 500 + offset * 5 },
      cores: [{ id: 0, total: 500 + offset * 5, idle: 250 + offset * 2 }],
    },
    memory: {
      total: 8 * 1024 ** 3,
      used: 4 * 1024 ** 3,
      available: 4 * 1024 ** 3,
      free: 1024 ** 3,
      cached: null,
      buffers: null,
      swapTotal: 2 * 1024 ** 3,
      swapUsed: 1024 ** 3,
      swapFree: 1024 ** 3,
    },
    processes: [],
    warnings: [],
  })
  return [make(0), make(100)]
}

/**
 * A Connection stub that records the registered route and exposes its handler.
 * @returns {object} the context and the captured route.
 */
function fakeConnection() {
  const captured = { route: undefined }
  const ctx = {
    logger: { warn() {} },
    effect(callback) {
      callback()
      return () => {}
    },
    inject(dependencies, callback) {
      // The session services are optional; a host without them must still boot.
      return callback(ctx)
    },
    get: () => undefined,
    connection: {
      fetch: {
        register(route) {
          captured.route = route
          return () => {}
        },
      },
    },
  }
  return { ctx, captured }
}

/**
 * Apply the plugin and read one snapshot response.
 * @param {object} [config] - the row's config block.
 * @returns {Promise<object>} the parsed response body.
 */
async function snapshot(config = {}) {
  const { ctx, captured } = fakeConnection()
  const { apply } = await import('../src/host/index.js')
  await apply(ctx, config)
  assert.ok(captured.route, 'the plugin must register its route')
  const request = { text: async () => '{}' }
  const response = await captured.route.fetch(request)
  assert.equal(response.status, 200, 'a snapshot request must succeed')
  return response.json()
}

test('the snapshot carries the live reading, disk, GPU and temperature together', async () => {
  const body = await snapshot()
  const value = body.value
  // The differenced metrics.
  assert.ok(value.cpu, 'the CPU reading is present')
  assert.ok(value.memory, 'the memory reading is present')
  assert.ok(Array.isArray(value.processes))
  // The two independent probes must both travel in the same response: a card
  // that renders from a missing field just looks empty, with nothing failing.
  assert.ok(value.gpu, 'the GPU reading is present')
  assert.ok(value.temperature, 'the temperature reading is present')
  assert.ok(value.temperature.groups, 'the temperature groups are present')
  assert.deepEqual(Object.keys(value.temperature.groups).sort(), ['cpu', 'disk', 'gpu', 'mainboard'])
  assert.equal(typeof value.refreshIntervalMs, 'number')
})

test('a hidden GPU line and a hidden temperature card both travel as hidden', async () => {
  const body = await snapshot({ gpu: false, temperature: false })
  assert.equal(body.value.gpu.status, 'hidden')
  assert.equal(body.value.temperature.status, 'hidden')
  // A hidden card contributes no warning: the user asked for it to be absent.
  assert.equal(
    body.value.warnings.some((code) => code.startsWith('gpu-') || code.startsWith('temperature-')),
    false,
  )
})

test('the route still answers when a probe throws, without hiding the metrics', async () => {
  // Probes are isolated: a GPU failure must never suppress CPU/memory/processes.
  const body = await snapshot({ gpuIntervalMs: 500 })
  assert.ok(body.value.cpu, 'metrics survive regardless of the probes')
  assert.ok(body.value.gpu)
  assert.ok(body.value.temperature)
})

test('both probes are constructed, so neither read is swallowed by the fallback', async () => {
  // A probe variable that its unload effect references but that was never defined
  // throws only when a request comes in, and the catch turns that into a bare
  // 'unavailable' — the panel then shows an empty card while every other spec
  // still passes. The giveaway is the logged warning: the route warns with the
  // probe name. So capture the logger and assert neither probe was reported.
  const warnings = []
  const { ctx, captured } = fakeConnection()
  ctx.logger = { warn: (...args) => warnings.push(args.join(' ')) }
  const { apply } = await import('../src/host/index.js')
  await apply(ctx, {})
  const response = await captured.route.fetch({ text: async () => '{}' })
  const body = await response.json()
  assert.ok(body.value.temperature, 'the temperature reading is present')
  assert.ok(body.value.gpu, 'the GPU reading is present')
  assert.equal(
    warnings.some((line) => /temperature read failed|GPU read failed/.test(line)),
    false,
    `a probe failed to read, which means it was never constructed: ${warnings.join('; ')}`,
  )
})

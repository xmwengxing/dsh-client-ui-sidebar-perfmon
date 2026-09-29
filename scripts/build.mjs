/**
 * Build both halves of the plugin.
 *
 * The host half is bundled to ESM at `lib/index.js` (dependency-free ESM in,
 * dependency-free ESM out). The browser half is bundled to a single classic
 * script at `client/client.js` and wrapped in the dsh module-loader envelope:
 * `window.__ModuleLoader__.load({ id, factory })` where `id` is the package name
 * — the loader validates that identity, so it is read from `package.json`
 * rather than repeated here.
 *
 * React is external in the browser bundle and reaches the template through the
 * factory's own `require('react')`, which is why the JSX transform is the classic
 * one: it compiles to `React.createElement` against that in-scope binding instead
 * of importing a second copy of the runtime.
 *
 * @module dsh-client-ui-sidebar-perfmon/build
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, context } from 'esbuild'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const watching = process.argv.includes('--watch')

/** Host half: plain ESM for Node, no bundling of peers. */
const hostOptions = {
  entryPoints: [resolve(root, 'src/host/index.js')],
  outfile: resolve(root, 'lib/index.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: ['node22'],
  packages: 'external',
  sourcemap: false,
  legalComments: 'none',
}

/** Browser half: one classic script wrapped in the module-loader envelope. */
const clientOptions = {
  entryPoints: [resolve(root, 'src/client/index.jsx')],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['chrome110'],
  external: ['react'],
  jsx: 'transform',
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  write: false,
  sourcemap: false,
  legalComments: 'none',
  loader: { '.js': 'jsx' },
}

/**
 * Wrap an esbuild CJS bundle in the dsh client module-loader envelope.
 * @param {string} bundled - the bundled source.
 * @returns {string} the script the browser loads.
 */
function wrap(bundled) {
  return `window.__ModuleLoader__.load({
  id: ${JSON.stringify(manifest.name)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");
${bundled}
    return module.exports;
  }
});
`
}

/** Run both builds once. */
async function buildOnce() {
  await mkdir(resolve(root, 'lib'), { recursive: true })
  await mkdir(resolve(root, 'client'), { recursive: true })
  await build(hostOptions)
  const result = await build(clientOptions)
  const bundled = result.outputFiles?.[0]?.text
  if (bundled === undefined) throw new Error('esbuild produced no client bundle')
  await writeFile(resolve(root, 'client/client.js'), wrap(bundled), 'utf8')
  console.log(`built ${manifest.name}: lib/index.js + client/client.js`)
}

if (!watching) {
  await buildOnce()
} else {
  const hostContext = await context(hostOptions)
  await hostContext.watch()
  // The wrapper is applied by hand, so the browser half rebuilds through a plugin.
  const clientContext = await context({
    ...clientOptions,
    plugins: [
      {
        name: 'perfmon-wrapper',
        setup(build) {
          build.onEnd(async (result) => {
            const bundled = result.outputFiles?.[0]?.text
            if (bundled === undefined) return
            await mkdir(resolve(root, 'client'), { recursive: true })
            await writeFile(resolve(root, 'client/client.js'), wrap(bundled), 'utf8')
            console.log('rebuilt client/client.js')
          })
        },
      },
    ],
  })
  await clientContext.watch()
  console.log('watching src/ — Ctrl-C to stop')
}

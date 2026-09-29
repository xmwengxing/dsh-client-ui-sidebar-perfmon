/**
 * Build the component bundle the behavioral specs mount.
 *
 * The published browser bundle is a self-contained classic script, so it has no
 * exports a spec could reach; this second, test-only bundle keeps React external
 * and emits CommonJS for `react-test-renderer`. It is written under `test/.build/`,
 * which is neither published nor committed.
 *
 * @module dsh-client-ui-sidebar-perfmon/build-test-bundle
 */

import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outdir = resolve(root, 'test/.build')

await mkdir(outdir, { recursive: true })
await build({
  entryPoints: [resolve(root, 'test/support/entry.jsx')],
  outfile: resolve(outdir, 'components.cjs'),
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: ['node22'],
  external: ['react'],
  jsx: 'transform',
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  loader: { '.js': 'jsx' },
  legalComments: 'none',
})

console.log('built test/.build/components.cjs')

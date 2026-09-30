/**
 * Specs for the directory scan controller.
 *
 * The arithmetic here is trivial (it is a sum), so the specs assert what is not:
 * that a scan never starts by itself, that a stop lands between syscalls rather
 * than at the end of the tree, that the budget and symlink rules hold, that the
 * last reading is served without filesystem work, and that a replaced pass does
 * not clobber the newer one. Every filesystem and session list is an injected
 * stub, so the failure paths are exercised rather than lucky.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve as resolvePath } from 'node:path'
import { createScanController, DU_WARNINGS, resolveProjectDir } from '../src/host/du.js'

/**
 * Build an injected filesystem from a nested literal.
 *
 * `{ 'a.txt': 10, 'sub/b.bin': 5 }` becomes a tree of two folders and two
 * regular files; every fs call counts its invocations and can be made slow, so
 * the stop-mid-walk paths are exercised rather than lucky.
 * @param {Record<string, number>} files - byte size per file path.
 * @param {{ broken?: string[], symlinks?: string[], lstatDelay?: () => Promise<void> }} [options] - faults to inject.
 * @returns {{readdir: Function, lstat: Function, calls: {readdir: number, lstat: number}}} the stub and its call counters.
 */
function stubFs(files, options = {}) {
  const broken = new Set(options.broken ?? [])
  const symlinks = new Set(options.symlinks ?? [])
  const calls = { readdir: 0, lstat: 0 }

  // Every key is stored under the root the specs mount the scanner at.
  const ROOT = '/p'
  const folders = new Set([ROOT])
  const fileMap = new Map()
  for (const [path, size] of Object.entries(files)) {
    const full = `${ROOT}/${path}`
    fileMap.set(full, size)
    const parts = full.split('/')
    // Every ancestor of the file up to the root is a folder — the file's own
    // segment included in the bound, so `/p/sub/deep/c.dat` registers `deep` too.
    for (let depth = 2; depth < parts.length; depth += 1) {
      folders.add(parts.slice(0, depth).join('/'))
    }
  }
  const all = [...folders, ...fileMap.keys(), ...symlinks]

  return {
    calls,
    readdir: async (dir) => {
      calls.readdir += 1
      const clean = String(dir).replace(/\\/g, '/')
      if (broken.has(clean) || broken.has(clean.split('/').pop() ?? '')) throw new Error('EACCES')
      const prefix = clean.endsWith('/') ? clean : `${clean}/`
      const names = new Set()
      for (const path of all) {
        if (!path.startsWith(prefix)) continue
        const rest = path.slice(prefix.length)
        const [head] = rest.split('/')
        if (head === '') continue
        names.add(head)
      }
      return [...names].map((name) => ({
        name,
        isDirectory: () => folders.has(`${prefix}${name}`),
        isFile: () => fileMap.has(`${prefix}${name}`),
        isSymbolicLink: () => symlinks.has(`${prefix}${name}`),
      }))
    },
    lstat: async (path) => {
      calls.lstat += 1
      if (options.lstatDelay !== undefined) await options.lstatDelay()
      const clean = String(path).replace(/\\/g, '/')
      if (broken.has(clean)) throw new Error('EPERM')
      const size = fileMap.get(clean)
      if (size === undefined) throw new Error('ENOENT')
      return { isFile: () => true, size }
    },
  }
}

test('nothing is measured until a scan is asked for', async () => {
  const fs = stubFs({ 'a.txt': 10 })
  const scanner = createScanController({ openCwds: () => ['/p'], fsImpl: fs })
  const before = scanner.state()
  assert.equal(before.status, 'idle')
  assert.equal(before.disk, null)
  assert.equal(fs.calls.readdir, 0, 'state() never touches the filesystem')
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(fs.calls.readdir, 0, 'a scan does not start by itself')
})

test('a started scan covers the open sessions folders once each', async () => {
  const fs = stubFs({ 'a.txt': 10, 'sub/b.bin': 5, 'other/c.txt': 7 })
  const scanner = createScanController({
    openCwds: () => ['/p/sub', '/p/other', '/p/sub'],
    fsImpl: fs,
  })
  scanner.start()
  await new Promise((resolve) => setTimeout(resolve, 10))
  const state = scanner.state()
  assert.equal(state.status, 'done')
  assert.equal(state.disk.projectBytes, 12, '5 + 7 with /p/sub deduplicated')
  assert.equal(state.disk.projectEntries, 2)
  assert.deepEqual(state.disk.projectDirs.map((entry) => entry.dir), ['/p/sub', '/p/other'])
  assert.deepEqual(state.disk.warnings, [])
})

test('state() after a finished scan costs no filesystem calls', async () => {
  const fs = stubFs({ 'a.txt': 10 })
  const scanner = createScanController({ openCwds: () => ['/p'], fsImpl: fs })
  scanner.start()
  await new Promise((resolve) => setTimeout(resolve, 10))
  const before = fs.calls.readdir + fs.calls.lstat
  for (let index = 0; index < 10; index += 1) scanner.state()
  assert.equal(fs.calls.readdir + fs.calls.lstat, before, 'the stored reading is served as-is')
})

test('stop() lands between syscalls and publishes the partial figures', async () => {
  const fs = stubFs({ 'a.txt': 1, 'b.txt': 2, 'c.txt': 4, 'd.txt': 8 }, {
    // A slow lstat widens the window so the stop reliably lands mid-walk.
    lstatDelay: () => new Promise((resolve) => setTimeout(resolve, 20)),
  })
  const scanner = createScanController({ openCwds: () => ['/p'], fsImpl: fs })
  scanner.start()
  await new Promise((resolve) => setTimeout(resolve, 5))
  scanner.stop()
  await new Promise((resolve) => setTimeout(resolve, 30))
  const state = scanner.state()
  assert.equal(state.status, 'done')
  assert.ok(state.disk.projectBytes < 15, 'the walk did not finish the whole tree')
  assert.ok(state.disk.warnings.includes(DU_WARNINGS.aborted), 'the partial figure says it was stopped')
  assert.ok(fs.calls.lstat < 4, `the stop landed mid-walk (${String(fs.calls.lstat)} of 4 files stat-ed)`)
})

test('an aborted scan still counts the entries it already measured', async () => {
  const fs = stubFs({ 'keep.txt': 6, 'gone.txt': 1 })
  const scanner = createScanController({ openCwds: () => ['/p'], fsImpl: fs })
  scanner.start()
  await new Promise((resolve) => setTimeout(resolve, 10))
  const state = scanner.state()
  assert.equal(state.disk.projectBytes, 7, 'a fast scan of a tiny tree completes')
  assert.deepEqual(state.disk.warnings, [])
})

test('a scan with no open session answers idle and walks nothing', async () => {
  const fs = stubFs({ 'a.txt': 1 })
  const scanner = createScanController({ openCwds: () => [], fsImpl: fs })
  const state = scanner.start()
  assert.equal(state.status, 'idle')
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(fs.calls.readdir, 0)
  assert.equal(scanner.state().disk, null)
})

test('a named folder is measured even when no session is open', async () => {
  // The GUI defect this answers: the sidebar shows sessions whose home process
  // never entered them into this process's live store, so the folder must come
  // from the request, not from the store.
  const fs = stubFs({ 'a.txt': 10, 'sub/b.bin': 5 })
  const scanner = createScanController({ openCwds: () => [], fsImpl: fs })
  const state = scanner.start('/p')
  assert.equal(state.status, 'scanning')
  await new Promise((resolve) => setTimeout(resolve, 10))
  const done = scanner.state()
  assert.equal(done.status, 'done')
  assert.equal(done.disk.projectBytes, 15)
  assert.deepEqual(done.disk.projectDirs.map((entry) => entry.dir), ['/p'])
  assert.equal(done.disk.warnings.includes(DU_WARNINGS.noRoot), false)
})

test('a named folder wins over the open-session derivation, and the config pin wins over both', async () => {
  const fs = stubFs({ 'a.txt': 1, 'other/b.txt': 2, 'pinned/c.txt': 4 })
  const scanner = createScanController({
    openCwds: () => ['/p/other'],
    fixedDir: '/p/pinned',
    fsImpl: fs,
  })
  scanner.start('/p')
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.deepEqual(
    scanner.state().disk.projectDirs.map((entry) => entry.dir),
    ['/p/pinned'],
    'the config pin overrides everything',
  )

  const noPin = createScanController({ openCwds: () => ['/p/other'], fsImpl: fs })
  noPin.start('/p')
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.deepEqual(noPin.state().disk.projectDirs.map((entry) => entry.dir), ['/p'])
})

test('a named-folder reading survives a later folder-set change', async () => {
  const fs = stubFs({ 'a.txt': 3 })
  const scanner = createScanController({ openCwds: () => [], fsImpl: fs })
  scanner.start('/p')
  await new Promise((resolve) => setTimeout(resolve, 10))
  // A later workspace-mode start over an empty session store starts nothing and
  // wipes nothing: the reading the user is looking at stays until a pass over a
  // real folder set replaces it.
  scanner.start()
  await new Promise((resolve) => setTimeout(resolve, 10))
  const state = scanner.state()
  assert.equal(state.status, 'done')
  assert.deepEqual(state.disk.projectDirs.map((entry) => entry.dir), ['/p'])
  assert.equal(state.disk.projectBytes, 3)
})

test('a named pass covers subfolders like any walk, and a mid-walk stop still publishes partials', async () => {
  const fs = stubFs({ 'a.txt': 1, 'b.txt': 2, 'c.txt': 4, 'd.txt': 8 }, {
    lstatDelay: () => new Promise((resolve) => setTimeout(resolve, 20)),
  })
  const scanner = createScanController({ openCwds: () => [], fsImpl: fs })
  scanner.start('/p')
  await new Promise((resolve) => setTimeout(resolve, 5))
  scanner.stop()
  await new Promise((resolve) => setTimeout(resolve, 30))
  const state = scanner.state()
  assert.equal(state.status, 'done')
  assert.ok(state.disk.projectBytes < 15, 'the walk did not finish')
  assert.ok(state.disk.warnings.includes(DU_WARNINGS.aborted), 'the partial figure says it was stopped')
  assert.ok(fs.calls.lstat < 4)
})

test('an unreadable folder is unavailable, not zero', async () => {
  const fs = stubFs({}, { broken: ['/p'] })
  const scanner = createScanController({ openCwds: () => ['/p'], fsImpl: fs })
  scanner.start()
  await new Promise((resolve) => setTimeout(resolve, 10))
  const state = scanner.state()
  assert.equal(state.disk.projectBytes, null)
  assert.ok(state.disk.warnings.includes(DU_WARNINGS.rootUnreadable))
})

test('an unreadable subfolder is skipped and named', async () => {
  const fs = stubFs({ 'keep/a.txt': 4, 'lost/secret.bin': 1000 }, { broken: ['/p/lost'] })
  const scanner = createScanController({ openCwds: () => ['/p'], fsImpl: fs })
  scanner.start()
  await new Promise((resolve) => setTimeout(resolve, 10))
  const state = scanner.state()
  assert.equal(state.disk.projectBytes, 4, 'the readable part is still measured')
  assert.ok(state.disk.warnings.includes(DU_WARNINGS.skipped))
})

test('the entry budget stops a walk and says the total is partial', async () => {
  const fs = stubFs(Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`f${String(index)}.txt`, 1])))
  const scanner = createScanController({ openCwds: () => ['/p'], fsImpl: fs, entryBudget: 8 })
  scanner.start()
  await new Promise((resolve) => setTimeout(resolve, 10))
  const state = scanner.state()
  assert.equal(state.disk.projectTruncated, true)
  assert.ok(state.disk.warnings.includes(DU_WARNINGS.partial))
  assert.equal(state.disk.projectEntries, 8)
  assert.equal(state.disk.projectBytes, 8)
})

test('a symlinked folder is neither followed nor counted', async () => {
  const fs = stubFs({ 'a.txt': 6, 'loop/self.txt': 0 }, { symlinks: ['/p/loop'] })
  const scanner = createScanController({ openCwds: () => ['/p'], fsImpl: fs })
  scanner.start()
  await new Promise((resolve) => setTimeout(resolve, 10))
  const state = scanner.state()
  assert.equal(state.disk.projectBytes, 6, 'only the real file counts')
  assert.equal(fs.calls.readdir, 1, 'the walk must not have descended into the link')
})

test('folders beyond maxDirs are counted, named, and not walked', async () => {
  const fs = stubFs({ 'w1/a.txt': 1, 'w2/b.txt': 2, 'w3/c.txt': 4 })
  const scanner = createScanController({
    openCwds: () => ['/p/w1', '/p/w2', '/p/w3'],
    maxDirs: 2,
    fsImpl: fs,
  })
  scanner.start()
  await new Promise((resolve) => setTimeout(resolve, 10))
  const state = scanner.state()
  assert.equal(state.disk.projectDirs.length, 2)
  assert.equal(state.disk.droppedDirCount, 1)
  assert.ok(state.disk.warnings.includes(DU_WARNINGS.dropped))
  assert.equal(state.disk.projectBytes, 3, 'only the first two folders are summed')
})

test('a running scan reports its status and partial cover', async () => {
  const fs = stubFs({ 'a.txt': 1, 'b.txt': 2, 'c.txt': 4, 'd.txt': 8 }, {
    lstatDelay: () => new Promise((resolve) => setTimeout(resolve, 15)),
  })
  const scanner = createScanController({ openCwds: () => ['/p'], fsImpl: fs })
  scanner.start()
  await new Promise((resolve) => setTimeout(resolve, 5))
  const state = scanner.state()
  assert.equal(state.status, 'scanning')
  assert.ok(state.disk !== null)
  scanner.stop()
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(scanner.state().status, 'done')
})

test('folders no longer open drop out of the finished reading', async () => {
  const fs = stubFs({ 'a.txt': 1, 'sub/b.txt': 2 })
  let cwds = ['/p', '/p/sub']
  const scanner = createScanController({ openCwds: () => cwds, fsImpl: fs })
  scanner.start()
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(scanner.state().disk.projectDirs.length, 2)
  cwds = ['/p'] // /p/sub is no longer open
  scanner.start()
  await new Promise((resolve) => setTimeout(resolve, 10))
  const state = scanner.state()
  assert.deepEqual(state.disk.projectDirs.map((entry) => entry.dir), ['/p'])
  assert.equal(state.disk.projectBytes, 3, 'the /p walk covers sub/ too — it is inside the folder')
})

test('a second start stops the running pass and begins a fresh one', async () => {
  const fs = stubFs({ 'a.txt': 1, 'b.txt': 2, 'c.txt': 4 }, {
    lstatDelay: () => new Promise((resolve) => setTimeout(resolve, 15)),
  })
  let cwds = ['/p']
  const scanner = createScanController({ openCwds: () => cwds, fsImpl: fs })
  scanner.start()
  await new Promise((resolve) => setTimeout(resolve, 5))
  cwds = ['/p'] // same folder: the restart is a clean re-walk
  scanner.start()
  await new Promise((resolve) => setTimeout(resolve, 120))
  const state = scanner.state()
  assert.equal(state.status, 'done')
  assert.equal(state.disk.projectBytes, 7, 'the second pass finished and owns the reading')
  assert.ok(state.disk.projectDirs.length > 0)
})

test('the controller never leaves a rejected promise behind', async () => {
  // A readdir that throws synchronously in an unhandled way must still resolve
  // the pass: the catch in start() folds it into the first folder's reading.
  const fs = stubFs({ 'a.txt': 1 })
  fs.readdir = async () => {
    throw new Error('EBADF')
  }
  const scanner = createScanController({ openCwds: () => ['/p'], fsImpl: fs })
  scanner.start()
  await new Promise((resolve) => setTimeout(resolve, 10))
  const state = scanner.state()
  assert.equal(state.status, 'done')
  assert.equal(state.disk.projectBytes, null, 'a broken filesystem answers unavailable, not zero')
})

test('resolveProjectDir pins a folder or yields to workspace mode', () => {
  assert.equal(resolveProjectDir(undefined), null, 'unset means workspace mode')
  assert.equal(resolveProjectDir(null), null)
  assert.equal(resolveProjectDir(true), null, 'true means workspace mode')
  assert.equal(resolveProjectDir(false), null)
  assert.equal(resolveProjectDir(''), null)
  assert.equal(resolveProjectDir('/explicit'), '/explicit')
  assert.equal(resolveProjectDir('rel/../rel'), resolvePath('rel/../rel'), 'relative paths resolve against the process cwd')
})

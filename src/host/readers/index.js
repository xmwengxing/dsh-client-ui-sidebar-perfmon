/**
 * Reader selection.
 *
 * One reader per platform family, chosen once at load. The three `cpuTimesFromOs`
 * implementations are identical by design — each reader is meant to be readable on
 * its own, and the duplication is a few lines against a shared import that would
 * hide which platform owns which fact. The parsers, which are the parts worth
 * testing, are exported from each reader.
 *
 * @module dsh-client-ui-sidebar-perfmon/readers
 */

import { darwinReader } from './darwin.js'
import { createGenericReader } from './generic.js'
import { linuxReader } from './linux.js'
import { win32Reader } from './win32.js'

/**
 * Human label for the platform, shown in the panel header.
 * @param {string} platform - a `process.platform` value.
 * @returns {string} the label to display.
 */
export function platformLabel(platform) {
  const labels = { linux: 'Linux', darwin: 'macOS', win32: 'Windows' }
  return labels[platform] ?? platform
}

/**
 * Choose the reader for a platform.
 * @param {string} platform - a `process.platform` value.
 * @returns {object} the reader, whose `sample()` yields one raw sample.
 */
export function selectReader(platform) {
  if (platform === 'linux') return linuxReader
  if (platform === 'darwin') return darwinReader
  if (platform === 'win32') return win32Reader
  return createGenericReader(platform)
}

export { darwinReader, linuxReader, win32Reader, createGenericReader }

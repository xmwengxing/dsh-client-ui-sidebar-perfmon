/**
 * Command execution for the platform readers.
 *
 * The Linux reader needs no subprocess at all, but macOS and Windows have no
 * in-process source for a process table, so those readers shell out to the
 * platform's own tools (`ps`, `vm_stat`, `sysctl`, PowerShell). This module is
 * the single place that runs one, with the properties the rest of the plugin
 * relies on:
 *
 * - a hard timeout, so a wedged tool cannot pin a sample forever;
 * - no shell, so an argument can never be re-interpreted;
 * - a rejection that carries the tool's stderr, because "ps: illegal option"
 *   is the difference between a typo and a platform difference;
 * - optional injection, so every reader is unit-testable without the platform
 *   it reads.
 *
 * @module dsh-client-ui-sidebar-perfmon/readers/exec
 */

import { execFile } from 'node:child_process'

/** Default ceiling for one helper invocation. */
export const DEFAULT_TIMEOUT_MS = 5000

/** Error carrying the failed command, its exit code and its stderr. */
export class CommandError extends Error {
  /**
   * @param {string} command - the executable that failed.
   * @param {string[]} args - the arguments it was given.
   * @param {string} reason - the underlying failure message.
   * @param {{code?: number | string, stderr?: string}} [detail] - exit facts.
   */
  constructor(command, args, reason, detail = {}) {
    super(`${command} ${args.join(' ')}: ${reason}`)
    this.name = 'CommandError'
    this.command = command
    this.args = args
    this.exitCode = detail.code
    this.stderr = (detail.stderr ?? '').trim()
  }
}

/**
 * Run one helper and return its standard output.
 * @param {string} command - the executable.
 * @param {string[]} args - its arguments.
 * @param {{timeoutMs?: number, maxBytes?: number}} [options] - limits.
 * @returns {Promise<string>} standard output, BOM stripped.
 */
export function runCommand(command, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxBytes = options.maxBytes ?? 8 * 1024 * 1024
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { timeout: timeoutMs, maxBuffer: maxBytes, windowsHide: true, encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (error !== null) {
          reject(
            new CommandError(command, args, error.message, {
              code: error.code,
              stderr: typeof stderr === 'string' ? stderr : '',
            }),
          )
          return
        }
        // PowerShell writes a UTF-8 BOM ahead of its JSON.
        resolve(typeof stdout === 'string' ? stdout.replace(/^\uFEFF/, '') : '')
      },
    )
  })
}

/**
 * Pick the first helper that exists, so a platform can prefer its modern tool.
 *
 * Both PowerShell names are tried in order: Windows PowerShell is always present
 * on Windows, and `pwsh` is the cross-platform one a user may have installed
 * instead. The probe runs the tool with a trivial script rather than looking it
 * up on `PATH`, because that is the property that actually matters.
 * @param {string[]} candidates - executable names to try in order.
 * @param {(command: string, args: string[], options?: object) => Promise<string>} run - runner.
 * @returns {Promise<string | undefined>} the first usable executable.
 */
export async function firstAvailable(candidates, run = runCommand) {
  for (const candidate of candidates) {
    try {
      await run(candidate, ['-NoProfile', '-NonInteractive', '-Command', 'exit 0'], { timeoutMs: 4000 })
      return candidate
    } catch {
      // try the next candidate
    }
  }
  return undefined
}

/**
 * Split a fixed-column-of-whitespace line into at most `limit` parts, so a field
 * that may itself contain spaces (a path) can be taken as the remainder.
 * @param {string} line - the line to split.
 * @param {number} limit - maximum number of parts.
 * @returns {string[]} the parts, empty when the line has no content.
 */
export function splitLimited(line, limit) {
  const trimmed = line.trim()
  if (trimmed === '') return []
  return trimmed.split(/\s+/).slice(0, limit)
}

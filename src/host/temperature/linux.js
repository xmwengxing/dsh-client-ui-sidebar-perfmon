/**
 * Temperature sources for Linux: `/sys/class/hwmon`, then the thermal zones.
 *
 * Linux is the one platform where a temperature costs nothing but a few small
 * file reads, so this source is read directly rather than through a helper.
 * Every hwmon chip announces itself (`name`) and every channel carries a
 * millidegree reading (`tempN_input`) with an optional `tempN_label`, which is
 * exactly enough to place a sensor in one of the panel's buckets.
 *
 * A chip this module does not recognise is not guessed at and not dropped: it
 * lands in `other`, so the panel can show it as itself rather than silently
 * losing a reading or mislabelling it as the CPU.
 *
 * The thermal zones are the fallback, and only the fallback: on a machine with
 * no hwmon chip at all (a VM, a small board) `/sys/class/thermal` still answers,
 * and reading both would list the same ACPI zone twice under two names.
 *
 * @module dsh-client-ui-sidebar-perfmon/temperature/linux
 */

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Where the kernel exposes sensor chips and, failing that, thermal zones. */
export const HWMON_ROOT = '/sys/class/hwmon'
export const THERMAL_ROOT = '/sys/class/thermal'

/**
 * Which bucket an hwmon chip's channels belong to, by the chip's own `name`.
 *
 * The list is deliberately explicit rather than pattern-matched: a chip that is
 * not named here is reported as `other`, because a wrong bucket is worse than an
 * unplaced one.
 */
const HWMON_KINDS = {
  // CPU packages and cores
  coretemp: 'cpu',
  k10temp: 'cpu',
  k8temp: 'cpu',
  zenpower: 'cpu',
  cpu_thermal: 'cpu',
  'cpu-thermal': 'cpu',
  fam15h_power: 'cpu',
  // Discrete and integrated GPUs
  amdgpu: 'gpu',
  radeon: 'gpu',
  nouveau: 'gpu',
  i915: 'gpu',
  xe: 'gpu',
  // Drives
  nvme: 'disk',
  drivetemp: 'disk',
  // Boards, embedded controllers and vendor ACPI
  acpitz: 'mainboard',
  it87: 'mainboard',
  nct6775: 'mainboard',
  nct6683: 'mainboard',
  nct6687: 'mainboard',
  dell_smm: 'mainboard',
  'dell-smm-hwmon': 'mainboard',
  thinkpad: 'mainboard',
  asus: 'mainboard',
  'asus-ec-sensors': 'mainboard',
  gigabyte_wmi: 'mainboard',
  'gigabyte-wmi': 'mainboard',
}

/** Thermal-zone `type` values, matched by prefix, and their buckets. */
const THERMAL_KINDS = [
  ['x86_pkg_temp', 'cpu'],
  ['acpitz', 'mainboard'],
  ['nvme', 'disk'],
  ['iwlwifi', 'other'],
]

/**
 * Place one hwmon chip in a bucket.
 * @param {string} chip - the chip's `name` attribute.
 * @returns {'cpu' | 'gpu' | 'disk' | 'mainboard' | 'other'} the bucket.
 */
export function classifyHwmon(chip) {
  const key = String(chip ?? '').trim().toLowerCase()
  return HWMON_KINDS[key] ?? 'other'
}

/**
 * Place one thermal zone in a bucket, by its `type`.
 * @param {string} type - the zone's `type` attribute.
 * @returns {'cpu' | 'gpu' | 'disk' | 'mainboard' | 'other'} the bucket.
 */
export function classifyThermalZone(type) {
  const key = String(type ?? '').trim().toLowerCase()
  for (const [prefix, kind] of THERMAL_KINDS) {
    if (key.startsWith(prefix)) return kind
  }
  return 'other'
}

/**
 * Turn one hwmon chip's channel files into sensors.
 *
 * A channel with no readable value is dropped rather than published as zero: the
 * kernel omits `tempN_input` for a channel it cannot sample, and a `0 °C` in the
 * panel would read as a measurement.
 * @param {string} chip - the chip's `name` attribute.
 * @param {Record<string, string>} files - file name to contents, for this chip.
 * @returns {object[]} the sensors this chip contributes.
 */
export function sensorsFromHwmon(chip, files) {
  const kind = classifyHwmon(chip)
  const name = String(chip ?? '').trim() || 'hwmon'
  const sensors = []
  for (const [file, raw] of Object.entries(files)) {
    const match = /^temp(\d+)_input$/.exec(file)
    if (match === null) continue
    const index = match[1]
    const milli = Number(String(raw).trim())
    if (!Number.isFinite(milli)) continue
    const label = String(files[`temp${index}_label`] ?? '').trim()
    sensors.push({
      id: `${name}:${index}`,
      kind,
      label: label === '' ? name : `${name} ${label}`,
      celsius: milli / 1000,
    })
  }
  return sensors
}

/**
 * Turn the thermal zones into sensors, for a machine with no hwmon chip.
 * @param {{type: string, milli: number}[]} zones - the parsed zones.
 * @returns {object[]} one sensor per zone.
 */
export function sensorsFromThermalZones(zones) {
  return zones.map((zone, index) => ({
    id: `zone${String(index)}`,
    kind: classifyThermalZone(zone.type),
    label: zone.type === '' ? `thermal_zone${String(index)}` : zone.type,
    celsius: zone.milli / 1000,
  }))
}

/**
 * Read every hwmon chip and its temperature channels.
 *
 * Every read is individually guarded: a chip that disappears between the
 * directory listing and the read (a hot-unplugged drive) costs that chip alone.
 * @param {string} [root] - the hwmon root, injectable for specs.
 * @returns {Promise<object[]>} the sensors found.
 */
export async function readHwmon(root = HWMON_ROOT) {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  const sensors = []
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    const dir = join(root, entry.name)
    let names
    try {
      names = await readdir(dir)
    } catch {
      continue
    }
    /** @type {Record<string, string>} */
    const files = {}
    for (const name of names) {
      // Only the chip name, its channel values and their labels matter.
      if (name !== 'name' && !/^temp\d+_(input|label)$/.test(name)) continue
      try {
        files[name] = await readFile(join(dir, name), 'utf8')
      } catch {
        // A channel that vanished is simply not a channel.
      }
    }
    const chip = String(files.name ?? entry.name).trim()
    sensors.push(...sensorsFromHwmon(chip, files))
  }
  return sensors
}

/**
 * Read the ACPI thermal zones, the fallback when there is no hwmon chip.
 * @param {string} [root] - the thermal root, injectable for specs.
 * @returns {Promise<object[]>} the zones found.
 */
export async function readThermalZones(root = THERMAL_ROOT) {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  const zones = []
  for (const entry of entries) {
    if (!entry.name.startsWith('thermal_zone')) continue
    const dir = join(root, entry.name)
    try {
      const [type, temp] = await Promise.all([
        readFile(join(dir, 'type'), 'utf8'),
        readFile(join(dir, 'temp'), 'utf8'),
      ])
      const milli = Number(temp.trim())
      if (!Number.isFinite(milli)) continue
      zones.push({ type: type.trim(), milli })
    } catch {
      // A zone without a readable temperature is not a zone.
    }
  }
  return zones
}

/** The Linux temperature source. */
export const linuxTemperature = {
  id: 'linux',
  /**
   * Read every temperature this machine exposes.
   * @returns {Promise<{sensors: object[], warnings: string[]}>} the reading.
   */
  async read() {
    const hwmon = await readHwmon()
    if (hwmon.length > 0) return { sensors: hwmon, warnings: [] }
    // No hwmon chip: the thermal zones are the only remaining in-kernel source.
    const zones = await readThermalZones()
    return { sensors: sensorsFromThermalZones(zones), warnings: [] }
  },
}

export default linuxTemperature

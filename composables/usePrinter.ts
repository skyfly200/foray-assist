// WebBluetooth thermal printer connection (Android/Chromium). Hardware untested.
import { ref, computed } from 'vue'
import type { MonoBitmap } from '~/utils/label'
import { encodeEscPos } from '~/utils/escpos'
import { encodeTspl } from '~/utils/tspl'

export type PrinterProtocol = 'escpos' | 'tspl'
export interface PrinterSettings { protocol: PrinterProtocol; deviceName?: string; deviceId?: string }

const SERVICES = [
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
]

// module-level state shared by all components
const settings = ref<PrinterSettings>({ protocol: 'escpos' })
const connected = ref(false)
const busy = ref(false)
const error = ref('')
let device: any = null
let characteristic: any = null
let loaded = false

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function usePrinter() {
  const bt = typeof navigator !== 'undefined' ? (navigator as any).bluetooth : undefined
  const supported = !!bt && typeof bt.requestDevice === 'function'
  const unsupportedReason = supported
    ? ''
    : 'Bluetooth printing needs Chrome or another Chromium browser on Android (WebBluetooth is not available on iOS Safari; iOS support is planned for a later phase).'

  async function loadSettings() {
    if (loaded) return
    loaded = true
    try {
      const row = await useDb().settings.get('printer')
      if (row?.value) settings.value = { protocol: 'escpos', ...(row.value as object) }
    } catch { /* ignore */ }
  }

  async function saveSettings(patch: Partial<PrinterSettings>) {
    settings.value = { ...settings.value, ...patch }
    await useDb().settings.put({ key: 'printer', value: { ...settings.value } })
  }

  async function findCharacteristic(server: any) {
    const services = await server.getPrimaryServices()
    let fallback: any = null
    for (const svc of services) {
      for (const ch of await svc.getCharacteristics()) {
        const p = ch.properties
        if (p.write || p.writeWithoutResponse) {
          if (SERVICES.includes(svc.uuid)) return ch
          fallback ??= ch
        }
      }
    }
    if (!fallback) throw new Error('No writable Bluetooth characteristic found on this device. Is it a printer?')
    return fallback
  }

  async function attach(dev: any) {
    device = dev
    dev.addEventListener?.('gattserverdisconnected', () => { connected.value = false; characteristic = null })
    const server = await dev.gatt.connect()
    characteristic = await findCharacteristic(server)
    connected.value = true
  }

  function explain(e: any): string {
    if (e?.name === 'NotFoundError' || /cancel/i.test(e?.message ?? '')) return 'No printer selected.'
    if (e?.name === 'SecurityError') return 'Bluetooth permission was denied.'
    if (e?.name === 'NetworkError') return 'Could not connect to the printer. Make sure it is on and in range.'
    return e?.message || String(e)
  }

  async function connect() {
    error.value = ''
    if (!supported) { error.value = unsupportedReason; return false }
    busy.value = true
    try {
      const dev = await bt.requestDevice({ acceptAllDevices: true, optionalServices: SERVICES })
      await attach(dev)
      await saveSettings({ deviceName: dev.name, deviceId: dev.id })
      return true
    } catch (e) { error.value = explain(e); return false } finally { busy.value = false }
  }

  /** Try to reconnect to a previously granted device without a chooser (needs getDevices()). */
  async function reconnect() {
    error.value = ''
    if (!supported || connected.value) return connected.value
    await loadSettings()
    if (typeof bt.getDevices !== 'function') return false
    busy.value = true
    try {
      const devs: any[] = await bt.getDevices()
      const dev = devs.find((d) => d.id === settings.value.deviceId) ?? devs.find((d) => d.name && d.name === settings.value.deviceName)
      if (!dev) return false
      await attach(dev)
      return true
    } catch (e) { error.value = explain(e); return false } finally { busy.value = false }
  }

  function disconnect() {
    try { device?.gatt?.disconnect() } catch { /* ignore */ }
    connected.value = false
    characteristic = null
  }

  async function writeChunked(bytes: Uint8Array, chunk = 100, delayMs = 20) {
    const noResp = characteristic.properties.writeWithoutResponse && typeof characteristic.writeValueWithoutResponse === 'function'
    for (let i = 0; i < bytes.length; i += chunk) {
      const part = bytes.slice(i, i + chunk)
      if (noResp) await characteristic.writeValueWithoutResponse(part)
      else await characteristic.writeValueWithResponse?.(part) ?? await characteristic.writeValue(part)
      await sleep(delayMs)
    }
  }

  async function print(bitmap: MonoBitmap, opts: { protocol?: PrinterProtocol; chunk?: number; delayMs?: number } = {}) {
    error.value = ''
    busy.value = true
    try {
      if (!connected.value && !(await reconnect())) throw new Error('Printer not connected. Tap Connect first.')
      const protocol = opts.protocol ?? settings.value.protocol
      const bytes = protocol === 'tspl' ? encodeTspl(bitmap) : encodeEscPos(bitmap)
      await writeChunked(bytes, opts.chunk ?? 100, opts.delayMs ?? 20)
      return true
    } catch (e) { error.value = explain(e); return false } finally { busy.value = false }
  }

  return {
    supported, unsupportedReason, settings, connected, busy, error,
    deviceName: computed(() => settings.value.deviceName),
    loadSettings, saveSettings, connect, reconnect, disconnect, print,
  }
}

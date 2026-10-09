// How nearby messages travel (roadmap Phase 13). The protocol only needs "broadcast these
// bytes to whoever is near" and "tell me what arrived", so the radio is swappable:
//   * BroadcastChannelTransport: other tabs/windows of the app on the same device. Works in
//     every browser today and is how the protocol is exercised before the native app exists.
//   * LoopbackHub: in-memory, for tests.
//   * Bluetooth (advertising + GATT) and Nearby Connections need the native wrapper from
//     Phase 11; they implement this same interface.
// Pure module: erasable TypeScript, unit-tested under plain Node.

export interface MeshTransport {
  readonly name: string
  start(): void
  stop(): void
  send(bytes: Uint8Array): void
  onMessage(cb: (bytes: Uint8Array) => void): () => void
}

/** All transports attached to one hub hear each other (never themselves). */
export class LoopbackHub {
  private peers = new Set<LoopbackTransport>()
  connect(): LoopbackTransport {
    const t = new LoopbackTransport(this)
    this.peers.add(t)
    return t
  }
  deliver(from: LoopbackTransport, bytes: Uint8Array) {
    for (const p of this.peers) if (p !== from) p.receive(bytes.slice())
  }
}

export class LoopbackTransport implements MeshTransport {
  readonly name = 'loopback'
  private cbs = new Set<(b: Uint8Array) => void>()
  private running = false
  private hub: LoopbackHub
  constructor(hub: LoopbackHub) { this.hub = hub }
  start() { this.running = true }
  stop() { this.running = false }
  send(bytes: Uint8Array) { if (this.running) this.hub.deliver(this, bytes) }
  receive(bytes: Uint8Array) { if (this.running) for (const cb of this.cbs) cb(bytes) }
  onMessage(cb: (b: Uint8Array) => void) { this.cbs.add(cb); return () => this.cbs.delete(cb) }
}

export class BroadcastChannelTransport implements MeshTransport {
  readonly name = 'other windows on this device'
  private ch: BroadcastChannel | null = null
  private cbs = new Set<(b: Uint8Array) => void>()
  private channel: string
  constructor(channel = 'fa-mesh') { this.channel = channel }
  start() {
    if (this.ch || typeof BroadcastChannel === 'undefined') return
    this.ch = new BroadcastChannel(this.channel)
    this.ch.onmessage = (e) => {
      if (e.data instanceof Uint8Array) for (const cb of this.cbs) cb(e.data)
    }
  }
  stop() { this.ch?.close(); this.ch = null }
  send(bytes: Uint8Array) { this.ch?.postMessage(bytes) }
  onMessage(cb: (b: Uint8Array) => void) { this.cbs.add(cb); return () => this.cbs.delete(cb) }
}

/**
 * Duty cycling: the radio is on for `onMs` out of every `periodMs`, to save battery. Only runs
 * while a foray is active (the caller starts and stops it).
 */
export class DutyCycle {
  private timer: ReturnType<typeof setTimeout> | null = null
  private on = false
  private t: MeshTransport
  private onMs: number
  private periodMs: number
  private onWake: () => void
  constructor(t: MeshTransport, onMs = 10_000, periodMs = 30_000, onWake: () => void = () => {}) {
    this.t = t
    this.onMs = onMs
    this.periodMs = periodMs
    this.onWake = onWake
  }
  get active() { return this.on }
  start() {
    if (this.timer) return
    const tick = () => {
      this.on = true
      this.t.start()
      this.onWake()
      this.timer = setTimeout(() => {
        this.on = false
        this.t.stop()
        this.timer = setTimeout(tick, Math.max(0, this.periodMs - this.onMs))
      }, this.onMs)
    }
    tick()
  }
  stop() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.on = false
    this.t.stop()
  }
}

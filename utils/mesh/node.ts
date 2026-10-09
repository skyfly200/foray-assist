// One device's side of nearby sharing (roadmap Phase 13): sends and receives find alerts and
// runs record sync over any MeshTransport. Storage is injected, so this runs in the app (Dexie)
// and under plain Node tests (in memory).
//
// Messages: alerts (first byte 1, see alert.ts) and sync messages (first byte 2):
//   2 | foray hint (2) | AES-GCM(JSON) with the foray key
//   JSON is one of { t: 'inv', items }  { t: 'want', ids }  { t: 'recs', records }
import { decodeAlert, type Alert } from './alert.ts'
import { concat, open, seal, utf8, type ForayKey, type KeyLookup } from './crypto.ts'
import { inventory, judge, verifyRecord, wanted, type Inventory, type MeshRecord, type Verdict } from './records.ts'
import type { MeshTransport } from './transport.ts'

export interface MeshStore {
  /** This device's own finds in the foray, signed. */
  ownRecords(): Promise<MeshRecord[]>
  /** Other people's records this device holds (it relays them too). */
  heldRecords(): Promise<MeshRecord[]>
  /** specimenId -> row id for every find this device knows in the foray. */
  specimenIndex(): Promise<Map<string, string>>
  save(rec: MeshRecord, verdict: Verdict): Promise<void>
}

export interface MeshNodeOptions {
  transport: MeshTransport
  foray: ForayKey
  lookup: KeyLookup
  store: MeshStore
  onAlert?: (a: Alert) => void
  onRecord?: (r: MeshRecord, v: Verdict) => void
  /** Records per 'recs' message (keeps messages small enough to chunk over Bluetooth). */
  batch?: number
}

const SYNC = 2

export class MeshNode {
  private o: MeshNodeOptions
  private off: (() => void) | null = null
  private seenAlerts = new Set<string>()
  private lastInvAt = 0
  readonly stats = { alertsIn: 0, recordsIn: 0, rejected: 0 }

  constructor(o: MeshNodeOptions) {
    this.o = o
  }

  start() {
    if (this.off) return
    this.o.transport.start()
    this.off = this.o.transport.onMessage((b) => void this.handle(b).catch(() => { this.stats.rejected++ }))
  }

  stop() {
    this.off?.()
    this.off = null
    this.o.transport.stop()
  }

  /** Tell nearby devices what we hold; they ask for what they lack. */
  async announce() {
    this.lastInvAt = Date.now()
    await this.sendSync({ t: 'inv', items: await this.myInventory() })
  }

  /** Broadcast an already-encoded alert (alert.ts encodeAlert). */
  sendAlert(bytes: Uint8Array) {
    this.o.transport.send(bytes)
  }

  private async myInventory(): Promise<Inventory> {
    const [own, held] = await Promise.all([this.o.store.ownRecords(), this.o.store.heldRecords()])
    return inventory([...own, ...held])
  }

  private async sendSync(msg: unknown) {
    const head = concat(new Uint8Array([SYNC]), this.o.foray.hint)
    this.o.transport.send(concat(head, await seal(this.o.foray, utf8(JSON.stringify(msg)), head)))
  }

  private async handle(bytes: Uint8Array) {
    if (bytes[0] === 1) {
      const a = await decodeAlert(bytes, this.o.foray, this.o.lookup)
      if (!a) { this.stats.rejected++; return }
      if (this.seenAlerts.has(a.specimenId)) return
      this.seenAlerts.add(a.specimenId)
      this.stats.alertsIn++
      this.o.onAlert?.(a)
      return
    }
    if (bytes[0] !== SYNC || bytes.length < 3) return
    if (bytes[1] !== this.o.foray.hint[0] || bytes[2] !== this.o.foray.hint[1]) return
    const plain = await open(this.o.foray, bytes.slice(3), bytes.slice(0, 3))
    if (!plain) { this.stats.rejected++; return }
    const msg = JSON.parse(new TextDecoder().decode(plain))

    if (msg.t === 'inv' && Array.isArray(msg.items)) {
      const mine = await this.myInventory()
      const need = wanted(mine, msg.items)
      if (need.length) await this.sendSync({ t: 'want', ids: need })
      // They lack something we hold: announce back (rate-limited so two phones don't ping-pong).
      if (wanted(msg.items, mine).length && Date.now() - this.lastInvAt > 1000) await this.announce()
    } else if (msg.t === 'want' && Array.isArray(msg.ids)) {
      const ids = new Set<string>(msg.ids)
      const [own, held] = await Promise.all([this.o.store.ownRecords(), this.o.store.heldRecords()])
      const out = [...own, ...held].filter((r) => ids.has(r.id))
      const n = this.o.batch ?? 20
      for (let i = 0; i < out.length; i += n) await this.sendSync({ t: 'recs', records: out.slice(i, i + n) })
    } else if (msg.t === 'recs' && Array.isArray(msg.records)) {
      const [own, held, index] = await Promise.all([this.o.store.ownRecords(), this.o.store.heldRecords(), this.o.store.specimenIndex()])
      const ownIds = new Set(own.map((r) => r.id))
      const heldMap = new Map(held.map((r) => [r.id, r]))
      for (const rec of msg.records as MeshRecord[]) {
        if (!(await verifyRecord(rec, this.o.lookup))) { this.stats.rejected++; continue }
        const v = judge(rec, heldMap, ownIds, index)
        if (v === 'new' || v === 'newer') {
          await this.o.store.save(rec, v)
          heldMap.set(rec.id, rec)
          if (rec.specimenId) index.set(rec.specimenId, rec.id)
          this.stats.recordsIn++
          this.o.onRecord?.(rec, v)
        } else if (v === 'conflict') {
          this.stats.rejected++
        }
      }
    }
  }
}

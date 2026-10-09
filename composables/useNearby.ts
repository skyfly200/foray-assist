// Nearby sharing for a shared foray (roadmap Phase 13): find alerts and record sync between
// devices with no signal. Opt-in (Settings), only while the foray screen is open and the foray
// is running, duty-cycled (radio on 10 s of every 30 s).
//
// Today the radio is a BroadcastChannel (other tabs and windows of the app on this device);
// that exercises the full protocol, encryption and signatures. Phone-to-phone Bluetooth needs
// the native app (roadmap Phase 11) and plugs in as another MeshTransport.
import { liveQuery } from 'dexie'
import { importForayKey } from '~/utils/mesh/crypto'
import { encodeAlert, nearbySummary, shouldAlert, type Alert } from '~/utils/mesh/alert'
import { recordFromFind, signRecord, type MeshRecord } from '~/utils/mesh/records'
import { BroadcastChannelTransport, DutyCycle } from '~/utils/mesh/transport'
import { MeshNode, type MeshStore } from '~/utils/mesh/node'
import type { Foray, NearbyAlert, PeerFindRow } from '~/utils/db'
import { getDeviceKey, keyLookupFor, memberNameFor } from './useDeviceKey'
import { getDisplayName } from './useSharedForay'
import { getPositionBestEffort } from './useFinds'

const ALERT_RECENT_MIN = 30 // re-announce our finds from the last 30 minutes on each wake

export async function nearbyEnabled(): Promise<boolean> {
  return ((await useDb().settings.get('nearbyEnabled'))?.value as boolean | undefined) ?? false
}

export async function setNearbyEnabled(on: boolean) {
  await useDb().settings.put({ key: 'nearbyEnabled', value: on })
}

function peerFromRecord(rec: MeshRecord, prev?: PeerFindRow): PeerFindRow {
  return {
    ...(prev ?? {}),
    id: rec.id,
    forayId: rec.forayId,
    source: prev?.source ?? 'mesh',
    authorName: rec.authorName,
    specimenId: rec.specimenId,
    timestamp: rec.timestamp,
    latitude: rec.latitude,
    longitude: rec.longitude,
    geoprivacy: rec.geoprivacy,
    fieldNotes: rec.fieldNotes,
    photos: prev?.photos ?? [],
    updatedAt: rec.updatedAt,
    receivedAt: nowIso(),
    record: rec,
  }
}

export function useNearby(forayId: string, foray: Ref<Foray | null | undefined>) {
  const enabled = ref(false)
  const active = ref(false) // radio currently on
  const running = ref(false)
  const error = ref('')
  const transportName = ref('')
  const alerts = ref<NearbyAlert[]>([])
  const here = ref<{ latitude: number; longitude: number } | null>(null)
  const received = ref(0)
  const summary = computed(() => nearbySummary(alerts.value as unknown as Alert[], here.value))

  let node: MeshNode | null = null
  let cycle: DutyCycle | null = null
  let alertSub: { unsubscribe(): void } | null = null
  const signedCache = new Map<string, MeshRecord>() // id|updatedAt -> signed record

  const store: MeshStore = {
    async ownRecords() {
      const db = useDb()
      const dev = await getDeviceKey()
      const name = (await getDisplayName()) || 'A member'
      const mine = await db.specimens.where('forayId').equals(forayId).filter((s) => !!s.specimenId).toArray()
      const out: MeshRecord[] = []
      for (const s of mine) {
        const k = `${s.id}|${s.updatedAt}|${name}`
        let r = signedCache.get(k)
        if (!r) {
          r = await signRecord(recordFromFind({ ...s, fieldNotes: s.fieldNotes as Record<string, string | undefined> }, name, dev.keyId), dev)
          signedCache.set(k, r)
        }
        out.push(r)
      }
      return out
    },
    async heldRecords() {
      const rows = await useDb().peerFinds.where('forayId').equals(forayId).toArray()
      return rows.filter((r) => r.record).map((r) => r.record!)
    },
    async specimenIndex() {
      const db = useDb()
      const [mine, peers] = await Promise.all([
        db.specimens.where('forayId').equals(forayId).toArray(),
        db.peerFinds.where('forayId').equals(forayId).toArray(),
      ])
      return new Map([...mine, ...peers].filter((x) => x.specimenId).map((x) => [x.specimenId, x.id]))
    },
    async save(rec) {
      const db = useDb()
      await db.transaction('rw', db.peerFinds, async () => {
        const prev = await db.peerFinds.get(rec.id)
        await db.peerFinds.put(peerFromRecord(rec, prev))
      })
    },
  }

  async function broadcastRecentAlerts() {
    if (!node || !foray.value?.shared?.meshKey) return
    const db = useDb()
    const dev = await getDeviceKey()
    const fk = await importForayKey(foray.value.shared.meshKey)
    const since = new Date(Date.now() - ALERT_RECENT_MIN * 60_000).toISOString()
    const recent = await db.specimens.where('forayId').equals(forayId).filter((s) => s.timestamp >= since).toArray()
    for (const s of recent) {
      const f = { ...s, speciesGuess: s.fieldNotes.speciesGuess }
      if (shouldAlert(f)) node.sendAlert(await encodeAlert(f, fk, dev))
    }
  }

  async function start() {
    error.value = ''
    const f = foray.value
    if (running.value || !f?.shared?.meshKey) return
    if (f.endedAt) { error.value = 'This foray has ended.'; return }
    try {
      const fk = await importForayKey(f.shared.meshKey)
      await getDeviceKey()
      const transport = new BroadcastChannelTransport(`fa-mesh-${forayId}`)
      transportName.value = transport.name
      node = new MeshNode({
        transport,
        foray: fk,
        lookup: keyLookupFor(f),
        store,
        onRecord: () => { received.value++ },
        onAlert: (a) => {
          void useDb().nearbyAlerts.put({ ...a, key: `${forayId}|${a.specimenId}`, forayId, authorName: memberNameFor(foray.value, a.keyId), heardAt: nowIso() })
        },
      })
      node.start()
      cycle = new DutyCycle(transport, 10_000, 30_000, () => {
        active.value = true
        void getPositionBestEffort(3000).then((p) => { if (p) here.value = p })
        void node?.announce().catch(() => {})
        void broadcastRecentAlerts().catch(() => {})
        setTimeout(() => { active.value = cycle?.active ?? false }, 10_050)
      })
      cycle.start()
      running.value = true
    } catch (e: any) {
      error.value = e?.message ?? String(e)
      stop()
    }
  }

  function stop() {
    cycle?.stop()
    node?.stop()
    cycle = null
    node = null
    running.value = false
    active.value = false
  }

  async function toggle(on: boolean) {
    enabled.value = on
    await setNearbyEnabled(on)
    if (on) await start()
    else stop()
  }

  onMounted(async () => {
    enabled.value = await nearbyEnabled()
    alertSub = liveQuery(() => useDb().nearbyAlerts.where('forayId').equals(forayId).toArray()).subscribe({
      next: (rows) => { alerts.value = rows },
      error: () => {},
    })
  })
  // Start once the foray (and its key) has loaded, if the person opted in.
  watch(() => [enabled.value, foray.value?.shared?.meshKey, foray.value?.endedAt] as const, ([on, key, ended]) => {
    if (on && key && !ended) void start()
    else stop()
  })
  onBeforeUnmount(() => {
    stop()
    alertSub?.unsubscribe()
  })

  return { enabled, running, active, error, transportName, alerts, summary, received, toggle, start, stop }
}

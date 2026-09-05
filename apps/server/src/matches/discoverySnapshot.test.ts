import assert from "node:assert/strict"
import test from "node:test"
import { createDiscoverySnapshotService, createInMemoryDiscoverySnapshots } from "./discoverySnapshot"
import type { DiscoverProfileRecord } from "./matchRepository"

const filters = { ageMin: 18, ageMax: 99, genders: [], vibes: [] }
test("snapshot pagination never skips unseen profiles after nine decisions", async () => {
  let profiles = Array.from({ length: 30 }, (_, i) => ({ userId: `profile_${String(i).padStart(2, "0")}` }) as DiscoverProfileRecord)
  const repository = createInMemoryDiscoverySnapshots(async () => profiles)
  const service = createDiscoverySnapshotService(repository)
  const first = await service.page({ userId: "viewer", filters, limit: 12 })
  profiles = profiles.slice(9)
  const second = await service.page({ userId: "viewer", filters, limit: 12, cursor: first.page.nextCursor! })
  assert.deepEqual(second.profiles.map(p => p.userId), Array.from({ length: 12 }, (_, i) => `profile_${i + 12}`))
  await assert.rejects(service.page({ userId: "other", filters, limit: 12, cursor: first.page.nextCursor! }), /cursor/i)
  await assert.rejects(service.page({ userId: "viewer", filters: { ...filters, ageMin: 22 }, limit: 12, cursor: first.page.nextCursor! }), /cursor/i)
})

test("expired snapshot is explicit and fresh pagination starts independently", async () => {
  const service = createDiscoverySnapshotService(createInMemoryDiscoverySnapshots(async () => Array.from({ length: 20 }, (_, i) => ({ userId: String(i) }) as DiscoverProfileRecord)))
  const now = new Date("2026-09-05T10:00:00.000Z")
  const first = await service.page({ userId: "viewer", filters, limit: 12, now })
  await assert.rejects(service.page({ userId: "viewer", filters, limit: 12, cursor: first.page.nextCursor!, now: new Date(now.getTime() + 30 * 60_000) }),
    (error: any) => error.code === "DISCOVERY_CURSOR_EXPIRED")
  await assert.rejects(service.page({ userId: "viewer", filters, limit: 12, cursor: "v1:12", now }), /cursor/i)
})

test("snapshot skips newly blocked profiles, bounds scanning, rejects malformed positions and invalid limits", async () => {
  const records = Array.from({length:1000},(_,i)=>({userId:String(i)}) as DiscoverProfileRecord)
  const service = createDiscoverySnapshotService(createInMemoryDiscoverySnapshots(async()=>records))
  const first = await service.page({userId:"viewer",filters,limit:2,blockedUserIds:async ids=>ids.filter(id=>id==="0")})
  assert.deepEqual(first.profiles.map(p=>p.userId),["1","2"])
  const payload = JSON.parse(Buffer.from(first.page.nextCursor!.slice(3),"base64url").toString())
  for (const changed of [{...payload,position:1001},{...payload,position:-1},{...payload,id:"-".repeat(36)}]) {
    await assert.rejects(service.page({userId:"viewer",filters,limit:2,cursor:`v2.${Buffer.from(JSON.stringify(changed)).toString("base64url")}`}),/cursor/i)
  }
  for (const limit of [0,21,NaN]) await assert.rejects(service.page({userId:"viewer",filters,limit}),/limit/i)
  const allBlocked = await service.page({userId:"viewer",filters,limit:2,blockedUserIds:async ids=>ids})
  assert.equal(allBlocked.profiles.length,0)
  assert.equal(allBlocked.page.hasMore,true)
})

test("refresh budget preserves every unexpired cursor and refuses only new snapshots", async () => {
  const service=createDiscoverySnapshotService(createInMemoryDiscoverySnapshots(async()=>Array.from({length:30},(_,i)=>({userId:String(i)}) as DiscoverProfileRecord)))
  const pages=[]
  for (let i=0;i<30;i++) pages.push(await service.page({userId:"viewer",filters,limit:12}))
  assert.equal(new Set(pages.map(p=>p.page.nextCursor)).size,30)
  await assert.rejects(service.page({userId:"viewer",filters,limit:12}),(error:any)=>error.code==="DISCOVERY_REFRESH_LIMIT")
  for (const page of pages) assert.equal((await service.page({userId:"viewer",filters,limit:12,cursor:page.page.nextCursor!,now:new Date(Date.now()+29*60_000)})).profiles.length,12)
  assert.equal((await service.page({userId:"viewer",filters,limit:12,now:new Date(Date.now()+31*60_000)})).profiles.length,12)
})

test("cleanup removing a prefix or middle ordinal never silently advances a valid cursor", async () => {
  for (const removed of [0,1]) {
    const repository=createInMemoryDiscoverySnapshots(async()=>Array.from({length:30},(_,i)=>({userId:String(i)}) as DiscoverProfileRecord))
    const service=createDiscoverySnapshotService({...repository,read:async input=>(await repository.read(input)).filter(row=>row.position!==removed)})
    await assert.rejects(service.page({userId:"viewer",filters,limit:12}), (error:any)=>error.code==="DISCOVERY_CURSOR_INVALID")
  }
})

test("periodic cleanup removes only expired memory metadata",async()=>{
  const service=createDiscoverySnapshotService(createInMemoryDiscoverySnapshots(async()=>Array.from({length:30},(_,i)=>({userId:String(i)}) as DiscoverProfileRecord)))
  const old=await service.page({userId:"old",filters,limit:12,now:new Date(Date.now()-31*60_000)})
  const current=await service.page({userId:"current",filters,limit:12})
  await service.purgeExpired()
  await assert.rejects(service.page({userId:"old",filters,limit:12,cursor:old.page.nextCursor!}),/cursor/i)
  assert.equal((await service.page({userId:"current",filters,limit:12,cursor:current.page.nextCursor!})).profiles.length,12)
})

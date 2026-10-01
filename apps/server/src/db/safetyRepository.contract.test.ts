import assert from "node:assert/strict"
import {
  createInMemorySafetyRepository,
  type ReportRecord,
  type SafetyRepository
} from "../safety/safetyRepository"
import { createPostgresSafetyRepository } from "./postgresSafetyRepository"
import { runRepositoryContract, type RepositoryContractBackend } from "./repositoryContract"
import { moderationRiskRank } from "../safety/moderationQueue"

type Backend = RepositoryContractBackend<SafetyRepository>

const AT = "2026-09-30T10:00:00.000Z"
const LATER = "2026-09-30T11:00:00.000Z"

function report(backend: Backend, overrides: Partial<ReportRecord> = {}): ReportRecord {
  return {
    reportId: backend.id("report"),
    actorUserId: backend.id("actor"),
    reportedUserId: backend.id("target"),
    reason: "harassment",
    note: "rude",
    idempotencyKey: backend.id("key"),
    createdAt: AT,
    status: "pending",
    ...overrides
  }
}

function blockFor(value: ReportRecord, createdAt = value.createdAt) {
  return { actorUserId: value.actorUserId, blockedUserId: value.reportedUserId, createdAt }
}

runRepositoryContract<SafetyRepository>({
  name: "safety repository",
  databaseUrl: process.env.DATABASE_URL,
  factories: {
    inMemory: () => createInMemorySafetyRepository(),
    postgres: (pool) => createPostgresSafetyRepository(pool)
  },
  cases: {
    "saveBlock is idempotent and keeps the first block time": async (backend) => {
      const actor = backend.id("actor")
      const target = backend.id("target")
      await backend.repository.saveBlock({ actorUserId: actor, blockedUserId: target, createdAt: AT })
      await backend.repository.saveBlock({ actorUserId: actor, blockedUserId: target, createdAt: LATER })
      assert.equal((await backend.repository.findBlock(actor, target))?.createdAt, AT)
      assert.deepEqual((await backend.repository.listBlocks(actor)).map((block) => block.blockedUserId), [target])
      assert.equal(await backend.repository.findBlock(target, actor), null, "blocks are directional records")

      await backend.repository.deleteBlock(actor, target)
      await backend.repository.deleteBlock(actor, target)
      assert.equal(await backend.repository.findBlock(actor, target), null)
    },

    "listBlockedUserIdsBetween sees blocks in both directions, only for candidates": async (backend) => {
      const viewer = backend.id("viewer")
      const blockedByViewer = backend.id("blocked_by_viewer")
      const blockerOfViewer = backend.id("blocker_of_viewer")
      const unrelated = backend.id("unrelated")
      await backend.repository.saveBlock({ actorUserId: viewer, blockedUserId: blockedByViewer, createdAt: AT })
      await backend.repository.saveBlock({ actorUserId: blockerOfViewer, blockedUserId: viewer, createdAt: AT })
      await backend.repository.saveBlock({ actorUserId: unrelated, blockedUserId: blockedByViewer, createdAt: AT })

      const found = await backend.repository.listBlockedUserIdsBetween(viewer, [blockedByViewer, blockerOfViewer, unrelated])
      assert.deepEqual([...found].sort(), [blockedByViewer, blockerOfViewer].sort())
      assert.deepEqual(await backend.repository.listBlockedUserIdsBetween(viewer, [unrelated]), [])
      assert.deepEqual(await backend.repository.listBlockedUserIdsBetween(viewer, []), [])
    },

    "deleting a block clears the pair from listBlockedUserIdsBetween only when no reverse block remains": async (backend) => {
      // Chat hides a pair's thread while this returns the partner, so an
      // unblock must restore visibility exactly when no block is left.
      const viewer = backend.id("viewer")
      const partner = backend.id("partner")
      await backend.repository.saveBlock({ actorUserId: viewer, blockedUserId: partner, createdAt: AT })
      await backend.repository.saveBlock({ actorUserId: partner, blockedUserId: viewer, createdAt: AT })
      await backend.repository.deleteBlock(viewer, partner)
      assert.deepEqual(await backend.repository.listBlockedUserIdsBetween(viewer, [partner]), [partner])
      assert.deepEqual(await backend.repository.listBlockedUserIdsBetween(partner, [viewer]), [viewer])
      await backend.repository.deleteBlock(partner, viewer)
      assert.deepEqual(await backend.repository.listBlockedUserIdsBetween(viewer, [partner]), [])
      assert.deepEqual(await backend.repository.listBlockedUserIdsBetween(partner, [viewer]), [])
    },

    "saveReportAndBlock creates once, replays the original and rejects a changed payload": async (backend) => {
      const original = report(backend)
      const created = await backend.repository.saveReportAndBlock(original, blockFor(original))
      assert.equal(created.kind, "created")

      const retry = { ...original, reportId: backend.id("report_retry"), createdAt: LATER }
      const replayed = await backend.repository.saveReportAndBlock(retry, blockFor(retry))
      assert.equal(replayed.kind, "replayed")
      if (replayed.kind !== "replayed") return
      assert.equal(replayed.report.reportId, original.reportId)
      assert.equal(replayed.report.createdAt, AT)
      assert.equal(replayed.block.createdAt, AT)

      for (const changed of [
        { note: "different" },
        { reason: "spam" as const },
        { reportedUserId: backend.id("someone_else") }
      ]) {
        const conflict = await backend.repository.saveReportAndBlock(
          { ...retry, ...changed },
          blockFor({ ...retry, ...changed })
        )
        assert.equal(conflict.kind, "conflict")
      }
      assert.equal((await backend.repository.listReportsForActor(original.actorUserId)).length, 1)
      assert.equal(await backend.repository.findBlock(original.actorUserId, backend.id("someone_else")), null,
        "a conflicting replay blocks nobody")
    },

    "a replay restores a block removed after the original report": async (backend) => {
      const original = report(backend)
      await backend.repository.saveReportAndBlock(original, blockFor(original))
      await backend.repository.deleteBlock(original.actorUserId, original.reportedUserId)
      const replayed = await backend.repository.saveReportAndBlock(
        { ...original, reportId: backend.id("report_retry") }, blockFor(original, LATER))
      assert.equal(replayed.kind, "replayed")
      assert.ok(await backend.repository.findBlock(original.actorUserId, original.reportedUserId))
    },

    "a new report keeps an existing block time; a second pending report on the same person returns the first": async (backend) => {
      const actor = backend.id("actor")
      const target = backend.id("target")
      await backend.repository.saveBlock({ actorUserId: actor, blockedUserId: target, createdAt: AT })
      const first = report(backend, { actorUserId: actor, reportedUserId: target, idempotencyKey: undefined, createdAt: LATER })
      const created = await backend.repository.saveReportAndBlock(first, blockFor(first))
      assert.equal(created.kind, "created")
      if (created.kind === "created") assert.equal(created.block.createdAt, AT)
      // Without a key, a repeat on the same person while the first is still
      // pending is the same report (2026-10-01) unless its reason is more
      // urgent (see the escalation case); spam is less urgent than harassment.
      const second = { ...first, reportId: backend.id("report_second"), reason: "spam" as const }
      const deduped = await backend.repository.saveReportAndBlock(second, blockFor(second))
      assert.equal(deduped.kind, "replayed")
      if (deduped.kind === "replayed") assert.equal(deduped.report.reportId, first.reportId)
      assert.equal((await backend.repository.listReportsForActor(actor)).length, 1)

      // Another person is a separate report; a resolved report no longer dedupes.
      const otherTarget = { ...first, reportId: backend.id("report_other"), reportedUserId: backend.id("other_target") }
      assert.equal((await backend.repository.saveReportAndBlock(otherTarget, blockFor(otherTarget))).kind, "created")
      assert.equal(await backend.repository.resolveReport(first.reportId, {
        action: "dismiss", resolvedAt: LATER, resolvedByAdminId: backend.id("admin"), resolvedByTokenId: backend.id("token")
      }), "resolved")
      const afterResolution = { ...first, reportId: backend.id("report_after") }
      assert.equal((await backend.repository.saveReportAndBlock(afterResolution, blockFor(afterResolution))).kind, "created")
      assert.equal((await backend.repository.listReportsForActor(actor)).length, 3)
    },

    "a more urgent repeat escalates the pending report in place and keeps both notes": async (backend) => {
      const actor = backend.id("actor")
      const target = backend.id("target")
      const policy = { windowStartedAt: AT, maxReportsInWindow: 20 }
      const first = report(backend, { actorUserId: actor, reportedUserId: target, reason: "spam", note: "sends links", idempotencyKey: undefined })
      assert.equal((await backend.repository.saveReportAndBlock(first, blockFor(first), policy)).kind, "created")

      const urgent = { ...first, reportId: backend.id("report_urgent"), reason: "underage" as const, note: "says they are 15", createdAt: LATER }
      const escalated = await backend.repository.saveReportAndBlock(urgent, blockFor(urgent), policy)
      assert.equal(escalated.kind, "escalated")
      if (escalated.kind === "escalated") {
        assert.equal(escalated.report.reportId, first.reportId)
        assert.equal(escalated.report.reason, "underage")
        assert.equal(escalated.report.note, "sends links / says they are 15")
        assert.equal(escalated.report.createdAt, AT, "the original time keeps it at the front of the queue")
      }
      const stored = await backend.repository.findReport(first.reportId)
      assert.equal(stored?.reason, "underage")
      assert.equal(stored?.note, "sends links / says they are 15")
      assert.equal(await backend.repository.findReport(urgent.reportId), null, "no second row")
      const queue = await backend.repository.listPendingReportsByRisk({ limit: 100 })
      const position = queue.findIndex((value) => value.reportId === first.reportId)
      assert.ok(position >= 0)
      assert.equal(moderationRiskRank(queue[position]!.reason), 0, "the report is in the urgent queue")

      // An exact repeat, an equally urgent or a less urgent repeat collapses
      // into the pending report without changing it.
      for (const [name, reason, note] of [["same", "underage", "says they are 15"], ["less", "spam", "more links"]] as const) {
        const repeat = { ...first, reportId: backend.id(`report_${name}`), reason, note, createdAt: LATER }
        const result = await backend.repository.saveReportAndBlock(repeat, blockFor(repeat), policy)
        assert.equal(result.kind, "replayed")
        if (result.kind === "replayed") assert.equal(result.report.note, "sends links / says they are 15")
      }
      assert.equal((await backend.repository.listReportsForActor(actor)).length, 1)
    },

    "report creation stops at the policy cap within its window": async (backend) => {
      const actor = backend.id("actor")
      const policy = { windowStartedAt: "2026-09-30T09:00:00.000Z", maxReportsInWindow: 2 }
      const old = report(backend, {
        actorUserId: actor, reportedUserId: backend.id("target_old"), idempotencyKey: undefined, createdAt: "2026-09-30T08:00:00.000Z"
      })
      assert.equal((await backend.repository.saveReportAndBlock(old, blockFor(old), policy)).kind, "created")
      for (const name of ["target_one", "target_two"]) {
        const next = report(backend, { actorUserId: actor, reportedUserId: backend.id(name), reportId: backend.id(`report_${name}`), idempotencyKey: undefined })
        assert.equal((await backend.repository.saveReportAndBlock(next, blockFor(next), policy)).kind, "created", name)
      }
      const overCap = report(backend, { actorUserId: actor, reportedUserId: backend.id("target_three"), reportId: backend.id("report_three"), idempotencyKey: undefined })
      assert.deepEqual(await backend.repository.saveReportAndBlock(overCap, blockFor(overCap), policy), { kind: "limited" })
      assert.equal(await backend.repository.findReport(overCap.reportId), null)
      assert.equal(await backend.repository.findBlock(actor, overCap.reportedUserId), null, "a refused report blocks nobody")

      // A replay of an existing report is never refused by the cap.
      const replay = report(backend, { actorUserId: actor, reportedUserId: backend.id("target_one"), reportId: backend.id("report_replay"), idempotencyKey: undefined })
      assert.equal((await backend.repository.saveReportAndBlock(replay, blockFor(replay), policy)).kind, "replayed")
    },

    "the pending queue pages by risk, then oldest first, with a keyset cursor": async (backend) => {
      const at = (minute: number) => new Date(Date.parse(AT) + minute * 60_000).toISOString()
      const seed = async (name: string, reason: ReportRecord["reason"], minute: number) => {
        const value = report(backend, {
          reportId: backend.id(`report_${name}`), actorUserId: backend.id(`actor_${name}`),
          reportedUserId: backend.id(`target_${name}`), reason, idempotencyKey: undefined, createdAt: at(minute)
        })
        await backend.repository.saveReportAndBlock(value, blockFor(value))
        return value.reportId
      }
      const spamOldest = await seed("spam_oldest", "spam", 0)
      const harassmentLater = await seed("harassment_later", "harassment", 5)
      const underageNewest = await seed("underage_newest", "underage", 9)
      const inappropriateEarlier = await seed("inappropriate_earlier", "inappropriate", 2)
      const resolved = await seed("resolved", "underage", 1)
      await backend.repository.resolveReport(resolved, {
        action: "dismiss", resolvedAt: LATER, resolvedByAdminId: backend.id("admin"), resolvedByTokenId: backend.id("token")
      })
      const expected = [underageNewest, inappropriateEarlier, harassmentLater, spamOldest]

      const seen: string[] = []
      let after: Parameters<SafetyRepository["listPendingReportsByRisk"]>[0]["after"]
      for (let page = 0; page < 50; page += 1) {
        const reports = await backend.repository.listPendingReportsByRisk({ limit: 2, after })
        // Other cases may leave pending reports; keep this case's own.
        seen.push(...reports.map((value) => value.reportId).filter((id) => expected.includes(id) || id === resolved))
        if (reports.length < 2) break
        const last = reports[reports.length - 1]!
        after = { riskRank: moderationRiskRank(last.reason), createdAt: last.createdAt, reportId: last.reportId }
      }
      assert.deepEqual(seen, expected)
    },

    "saveReport never overwrites an existing report": async (backend) => {
      const original = report(backend, { idempotencyKey: undefined })
      await backend.repository.saveReport(original)
      await assert.rejects(backend.repository.saveReport({ ...original, note: "overwritten" }))
      assert.equal((await backend.repository.findReport(original.reportId))?.note, "rude")
    },

    "resolveReport resolves a pending report once": async (backend) => {
      const original = report(backend)
      await backend.repository.saveReportAndBlock(original, blockFor(original))
      const resolution = {
        action: "dismiss",
        note: "no violation",
        resolvedAt: LATER,
        resolvedByAdminId: backend.id("admin"),
        resolvedByTokenId: backend.id("token")
      }
      assert.equal(await backend.repository.resolveReport(original.reportId, resolution), "resolved")
      assert.equal(await backend.repository.resolveReport(original.reportId, resolution), "conflict")
      assert.equal(await backend.repository.resolveReport(backend.id("missing"), resolution), "not_found")
      const stored = await backend.repository.findReport(original.reportId)
      assert.equal(stored?.status, "dismissed")
      assert.equal(stored?.resolution?.adminNote, "no violation")
      assert.equal(stored?.resolution?.resolvedAt, LATER)
    }
  }
})

import assert from "node:assert/strict"
import {
  createInMemorySafetyRepository,
  type ReportRecord,
  type SafetyRepository
} from "../safety/safetyRepository"
import { createPostgresSafetyRepository } from "./postgresSafetyRepository"
import { runRepositoryContract, type RepositoryContractBackend } from "./repositoryContract"

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

    "a new report keeps an existing block time; reports without a key are independent": async (backend) => {
      const actor = backend.id("actor")
      const target = backend.id("target")
      await backend.repository.saveBlock({ actorUserId: actor, blockedUserId: target, createdAt: AT })
      const first = report(backend, { actorUserId: actor, reportedUserId: target, idempotencyKey: undefined, createdAt: LATER })
      const created = await backend.repository.saveReportAndBlock(first, blockFor(first))
      assert.equal(created.kind, "created")
      if (created.kind === "created") assert.equal(created.block.createdAt, AT)
      const second = { ...first, reportId: backend.id("report_second") }
      assert.equal((await backend.repository.saveReportAndBlock(second, blockFor(second))).kind, "created")
      assert.equal((await backend.repository.listReportsForActor(actor)).length, 2)
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

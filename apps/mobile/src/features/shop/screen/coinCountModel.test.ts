import assert from "node:assert/strict"
import test from "node:test"
import { formatCoins } from "../shopFormatters"
import {
  COIN_COUNT_DURATION_MS,
  formatCoinCount,
  getCoinBalanceLayoutText,
  getCoinBalanceTransition,
  getCoinGroupSeparator,
  getNextCoinBalance,
  settleCoinBalance,
  type VerifiedCoinBalance
} from "./coinCountModel"

const EMPTY: VerifiedCoinBalance = { previous: null, current: null, transition: { durationMs: 0, animate: false } }

function changed(balance: VerifiedCoinBalance | null): VerifiedCoinBalance {
  assert.ok(balance, "expected the balance to change")
  return balance
}

test("the worklet formatter matches the locale coin format for TR and EN", () => {
  for (const value of [0, 7, 999, 1_000, 1_500, 12_345, 999_999, 1_234_567]) {
    assert.equal(formatCoinCount(value, getCoinGroupSeparator("en")), formatCoins(value, "en"), `en ${value}`)
    assert.equal(formatCoinCount(value, getCoinGroupSeparator("tr")), formatCoins(value, "tr"), `tr ${value}`)
  }
  assert.equal(formatCoinCount(1_500, getCoinGroupSeparator("tr")), "1.500")
  assert.equal(formatCoinCount(1_500, getCoinGroupSeparator("en")), "1,500")
})

test("the worklet formatter never shows a negative or fractional balance", () => {
  assert.equal(formatCoinCount(-10, ","), "0")
  assert.equal(formatCoinCount(1_499.9, ","), "1,499")
  assert.equal(formatCoinCount(Number.NaN, ","), "0")
})

test("intermediate counts render as whole, grouped coins between the confirmed balances", () => {
  // The UI thread formats Math.round(animatedCount); every frame stays in range.
  const rendered = []
  for (let step = 0; step <= 12; step += 1) {
    const count = 1_000 + (900 - 1_000) * (step / 12)
    rendered.push(formatCoinCount(Math.round(count), getCoinGroupSeparator("en")))
  }
  assert.equal(rendered[0], "1,000")
  assert.equal(rendered[6], "950")
  assert.equal(rendered[12], "900")
  const values = rendered.map((text) => Number(text.replace(/,/g, "")))
  for (let index = 1; index < values.length; index += 1) {
    assert.ok(Number.isInteger(values[index]) && values[index] <= values[index - 1])
  }
  assert.equal(formatCoinCount(Math.round(1_249.6), getCoinGroupSeparator("tr")), "1.250")
})

test("the first verified balance appears without animation", () => {
  assert.deepEqual(
    getCoinBalanceTransition({ previous: null, next: 500, isFirstVerified: true, reduceMotion: false }),
    { durationMs: 0, animate: false }
  )
})

test("a server-confirmed increase or decrease counts over the shared count duration", () => {
  for (const [previous, next] of [[500, 380], [380, 1_380]]) {
    const transition = getCoinBalanceTransition({ previous, next, isFirstVerified: false, reduceMotion: false })
    assert.equal(transition.animate, true)
    assert.equal(transition.durationMs, COIN_COUNT_DURATION_MS)
  }
})

test("an unchanged balance does not animate", () => {
  assert.deepEqual(
    getCoinBalanceTransition({ previous: 500, next: 500, isFirstVerified: false, reduceMotion: false }),
    { durationMs: 0, animate: false }
  )
})

test("Reduce Motion shows the new balance immediately", () => {
  assert.deepEqual(
    getCoinBalanceTransition({ previous: 500, next: 380, isFirstVerified: false, reduceMotion: true }),
    { durationMs: 0, animate: false }
  )
})

test("the layout text reserves the wider balance only while counting", () => {
  const counting = { durationMs: COIN_COUNT_DURATION_MS, animate: true }
  const settled = { durationMs: 0, animate: false }
  assert.equal(getCoinBalanceLayoutText({ previous: 1_000, current: 900, transition: counting }, "en"), "1,000")
  assert.equal(getCoinBalanceLayoutText({ previous: 900, current: 1_000, transition: counting }, "tr"), "1.000")
  assert.equal(getCoinBalanceLayoutText({ previous: 1_000, current: 900, transition: settled }, "en"), "900")
  assert.equal(getCoinBalanceLayoutText({ previous: null, current: 42, transition: settled }, "en"), "42")
  assert.equal(getCoinBalanceLayoutText(EMPTY, "en"), "—")
})

test("unverified balances never enter the counter; the first verified one is static", () => {
  assert.equal(getNextCoinBalance(EMPTY, { coins: 0, verified: false, reduceMotion: false }), null)
  const first = changed(getNextCoinBalance(EMPTY, { coins: 500, verified: true, reduceMotion: false }))
  assert.deepEqual(first, { previous: null, current: 500, transition: { durationMs: 0, animate: false } })
  assert.equal(getNextCoinBalance(first, { coins: 500, verified: true, reduceMotion: false }), null)
})

test("a purchase counts from the last confirmed balance across the reconcile gap", () => {
  const confirmed = changed(getNextCoinBalance(EMPTY, { coins: 500, verified: true, reduceMotion: false }))
  // Reconciliation briefly marks inventory unverified; the stale value is ignored.
  assert.equal(getNextCoinBalance(confirmed, { coins: 0, verified: false, reduceMotion: false }), null)
  const purchased = changed(getNextCoinBalance(confirmed, { coins: 380, verified: true, reduceMotion: false }))
  assert.deepEqual(purchased, {
    previous: 500,
    current: 380,
    transition: { durationMs: COIN_COUNT_DURATION_MS, animate: true }
  })
  const settled = settleCoinBalance(purchased, 380)
  assert.deepEqual(settled.transition, { durationMs: 0, animate: false })
  assert.equal(settled.current, 380)
  assert.equal(settleCoinBalance(settled, 380), settled)
  // A newer balance that arrived mid-count is not settled by the older count.
  const newer = changed(getNextCoinBalance(purchased, { coins: 1_380, verified: true, reduceMotion: false }))
  assert.equal(settleCoinBalance(newer, 380), newer)
})

test("under Reduce Motion a confirmed change is applied instantly", () => {
  const confirmed = changed(getNextCoinBalance(EMPTY, { coins: 500, verified: true, reduceMotion: true }))
  const purchased = changed(getNextCoinBalance(confirmed, { coins: 380, verified: true, reduceMotion: true }))
  assert.deepEqual(purchased.transition, { durationMs: 0, animate: false })
})

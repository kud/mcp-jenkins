import { describe, it, expect } from "vitest"
import {
  guardToolResultText,
  MAX_TOOL_RESULT_BYTES,
} from "../../src/common/result-guard.js"

const overLimit = (pad: string) => "x".repeat(MAX_TOOL_RESULT_BYTES) + pad

describe("guardToolResultText", () => {
  it("passes a result under the limit through unchanged", () => {
    const text = JSON.stringify({ ok: true, note: "small" }, null, 2)
    expect(guardToolResultText(text)).toBe(text)
  })

  it("accepts a result sitting exactly on the limit", () => {
    const text = "y".repeat(MAX_TOOL_RESULT_BYTES)
    expect(guardToolResultText(text)).toBe(text)
  })

  it("cuts an oversized result and carries the truncation note", () => {
    const result = guardToolResultText(overLimit("tail"))
    expect(result).toContain("[truncated: result was ")
    expect(result).toContain("Narrow the request, for example with start, maxBytes or pattern on jenkins_get_console_log.")
    // The head survives; the tail does not.
    expect(result.startsWith("x".repeat(100))).toBe(true)
    expect(result.startsWith("xxxtail")).toBe(false)
  })

  it("never exceeds the byte limit", () => {
    const result = guardToolResultText(overLimit("tail"))
    expect(Buffer.byteLength(result, "utf8")).toBeLessThanOrEqual(
      MAX_TOOL_RESULT_BYTES,
    )
  })

  it("measures multi-byte characters in bytes, not string length", () => {
    // Every character is 2 bytes in UTF-8, so a string under the limit in
    // .length overruns it in bytes.
    const text = "\u00e9".repeat(MAX_TOOL_RESULT_BYTES)
    expect(Buffer.byteLength(text, "utf8")).toBe(MAX_TOOL_RESULT_BYTES * 2)
    const result = guardToolResultText(text)
    expect(Buffer.byteLength(result, "utf8")).toBeLessThanOrEqual(
      MAX_TOOL_RESULT_BYTES,
    )
    expect(result.slice(0, 100)).toBe("\u00e9".repeat(100))
    // The cut keeps whole characters: no replacement glyphs in the head.
    expect(result.slice(0, -100).replace(/\ufffd/g, "")).toBe(
      result.slice(0, -100),
    )
  })
})

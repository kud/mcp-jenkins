import { describe, it, expect, afterEach, vi } from "vitest"
import { installFakeJenkins, type FakeJob } from "../helpers/fake-jenkins.js"
import { makeClient } from "../helpers/client.js"
import { getConsoleLog } from "../../src/lib/console-log.js"

const WORKFLOW = "org.jenkinsci.plugins.workflow.job.WorkflowJob"

// One job, one build, the given log.
const withLog = (log: string, building = false) => {
  const job: FakeJob = {
    segments: ["web"],
    _class: WORKFLOW,
    builds: [{ number: 10, result: building ? null : "SUCCESS", building, log }],
  }
  installFakeJenkins([job])
  return makeClient()
}

afterEach(() => vi.unstubAllGlobals())

describe("getConsoleLog — default tail", () => {
  it("returns the last 500 lines, truncated, on a longer log", async () => {
    const lines = Array.from({ length: 600 }, (_, i) => `Line ${i + 1}`)
    const fullLog = lines.join("\n") + "\n"
    const result = await getConsoleLog(withLog(fullLog), "web", 10)

    expect(result.truncated).toBe(true)
    expect(result.totalBytes).toBe(Buffer.byteLength(fullLog, "utf8"))
    // startByte is a true resume offset into the full log.
    expect(result.startByte! + result.returnedBytes).toBe(result.totalBytes)
    expect(result.text).toBe(lines.slice(100).join("\n") + "\n")
  })

  it("cuts the byte cap at a line boundary when lines are very long", async () => {
    const fullLog = Array.from({ length: 8 }, (_, i) => `${i} ` + "x".repeat(60000)).join("\n")
    const result = await getConsoleLog(withLog(fullLog), "web", 10)

    expect(result.truncated).toBe(true)
    expect(result.returnedBytes).toBeLessThanOrEqual(204800)
    expect(result.returnedBytes).toBeGreaterThan(60000)
    expect(result.text).toMatch(/\n$/)
    expect(result.text!.split("\n").length).toBe(4)
  })

  it("returns a short log whole with truncated false", async () => {
    const fullLog = "Line 1\nLine 2\nLine 3\n"
    const result = await getConsoleLog(withLog(fullLog), "web", 10)

    expect(result.truncated).toBe(false)
    expect(result.text).toBe(fullLog)
    expect(result.startByte).toBe(0)
    expect(result.totalBytes).toBe(Buffer.byteLength(fullLog, "utf8"))
  })

  it("keeps logSnippet from the fetched log", async () => {
    const result = await getConsoleLog(withLog("First line of the log\nSecond line\n"), "web", 10, {
      maxSnippetLength: 10,
    })
    expect(result.logSnippet).toBe("First line")
  })

  it("defaults to the last build when buildNumber is omitted", async () => {
    const result = await getConsoleLog(withLog("hello\n"), "web")
    expect(result.buildNumber).toBe(10)
  })

  it("maps a 404 on the log fetch to build not found", async () => {
    await expect(getConsoleLog(withLog("x\n"), "web", 12)).rejects.toThrow(
      "Build 12 not found for job web",
    )
  })
})

describe("getConsoleLog — validation", () => {
  it.each([
    [{ start: -1 }, /start must be a non-negative whole number/],
    [{ start: 1.5 }, /start must be a non-negative whole number/],
    [{ maxBytes: 0 }, /maxBytes must be a positive whole number/],
    [{ maxSnippetLength: -3 }, /maxSnippetLength must be a positive whole number/],
    [{ pattern: 5 as unknown as string }, /pattern must be a string/],
  ])("rejects %o before any request", async (options, message) => {
    const fake = installFakeJenkins()
    await expect(getConsoleLog(makeClient(), "app", 3, options)).rejects.toThrow(message)
    expect(fake.requests).toHaveLength(0)
  })
})

describe("getConsoleLog — paging", () => {
  it("reads the head through progressiveText from start: 0", async () => {
    const fullLog = "alpha\nbeta\ngamma\n"
    const client = withLog(fullLog)
    const result = await getConsoleLog(client, "web", 10, { start: 0 })

    expect(result.text).toBe(fullLog)
    expect(result.truncated).toBe(false)
    expect(result.nextStart).toBe(Buffer.byteLength(fullLog))
    expect(result.moreData).toBe(false)
  })

  it("never downloads the whole log to page it", async () => {
    const fake = installFakeJenkins([
      { segments: ["web"], _class: WORKFLOW, builds: [{ number: 10, result: "SUCCESS", log: "a\nb\n" }] },
    ])
    await getConsoleLog(makeClient(), "web", 10, { start: 2 })
    expect(fake.requests.some((r) => r.path.endsWith("/consoleText"))).toBe(false)
    const paged = fake.requests.find((r) => r.path.endsWith("/logText/progressiveText"))
    expect(new URL(paged!.url).searchParams.get("start")).toBe("2")
  })

  it("slices an oversized chunk to maxBytes and reports the resume offset", async () => {
    const fullLog = `${"a".repeat(200)}\n${"b".repeat(200)}\n${"c".repeat(200)}\n`
    const result = await getConsoleLog(withLog(fullLog), "web", 10, { start: 0, maxBytes: 400 })

    expect(result.truncated).toBe(true)
    expect(result.returnedBytes).toBeLessThanOrEqual(400)
    expect(result.nextStart).toBe(result.returnedBytes)
  })

  it("reports more data while the build is still running", async () => {
    const result = await getConsoleLog(withLog("partial\n", true), "web", 10, { start: 0 })
    expect(result.moreData).toBe(true)
  })

  it("maps a 404 on a paged fetch to build not found", async () => {
    await expect(getConsoleLog(withLog("x\n"), "web", 12, { start: 0 })).rejects.toThrow(
      "Build 12 not found for job web",
    )
  })
})

describe("getConsoleLog — pattern", () => {
  it("treats a compiling pattern as a regex over the whole log and numbers hits", async () => {
    const lines = Array.from({ length: 800 }, (_, i) =>
      (i + 1) % 100 === 0 ? `ERROR at step ${i + 1}` : `ok step ${i + 1}`,
    )
    const result = await getConsoleLog(withLog(lines.join("\n") + "\n"), "web", 10, {
      pattern: "^ERROR at step (\\d+)$",
    })

    expect(result.totalMatches).toBe(8)
    expect(result.truncated).toBe(false)
    expect(result.matches).toEqual(
      [100, 200, 300, 400, 500, 600, 700, 800].map((n) => ({ line: n, text: `ERROR at step ${n}` })),
    )
  })

  it("falls back to a plain substring match when the pattern does not compile", async () => {
    const result = await getConsoleLog(withLog("ERROR(not found)\nok\nERROR(ok)\n"), "web", 10, {
      pattern: "ERROR(",
    })
    expect(result.matches).toEqual([
      { line: 1, text: "ERROR(not found)" },
      { line: 3, text: "ERROR(ok)" },
    ])
  })

  it("caps matches at 500 and reports the total", async () => {
    const lines = Array.from({ length: 700 }, (_, i) => `MISS ${i + 1}`)
    const result = await getConsoleLog(withLog(lines.join("\n") + "\n"), "web", 10, { pattern: "MISS" })

    expect(result.matches).toHaveLength(500)
    expect(result.totalMatches).toBe(700)
    expect(result.truncated).toBe(true)
  })
})

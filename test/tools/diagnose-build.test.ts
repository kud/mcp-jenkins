import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
  installFakeJenkins,
  BASE_URL,
  type FakeJenkins,
} from "../helpers/fake-jenkins.js"
import { makeClient } from "../helpers/client.js"
import { toolHandlers } from "../../src/tool-handlers.js"
import { rawTools } from "../../src/tool-manifest.js"
import { formatDiagnosis, parseBuildUrl } from "../../src/lib/diagnosis.js"

let fake: FakeJenkins
let client: ReturnType<typeof makeClient>
const diagnose = (input: Record<string, unknown>) =>
  toolHandlers.jenkins_diagnose_build(client, input)

beforeEach(() => {
  fake = installFakeJenkins()
  client = makeClient()
})
afterEach(() => vi.unstubAllGlobals())

describe("jenkins_diagnose_build", () => {
  it("reads a failed build in one screen", async () => {
    const r = await diagnose({ jobName: "app", buildNumber: 3 })
    expect(r).toMatchObject({
      job: "app",
      build: 3,
      result: "FAILURE",
      url: `${BASE_URL}/job/app/3/`,
    })
    expect(r.summary).toMatchInlineSnapshot(`
      "app #3  FAILURE
      https://jenkins.example.com/job/app/3/

      stage Test  FAILED
      step  npm test  FAILED
        report https://reports.example.com/app/3
        line 2 of 8
          running 3 tests
          PASS auth logs in
          Error: expected 401, got 200
              at auth.test.ts:12
          Report Link: https://reports.example.com/app/3
          2 failed
          
        last lines hidden (tail: true to show)

      skipped (earlier failure): Deploy

      junit 2 failed of 3
        ✗ app.Auth.rejects bad token
          expected 401, got 200
        ✗ app.Cart.totals
          expected 30, got 29"
    `)
  })

  it("defaults to the last build without expanding the job's history", async () => {
    const r = await diagnose({ jobName: "app" })
    expect(r.build).toBe(3)
    expect(fake.requests.some((req) => req.url.includes("depth=1"))).toBe(false)
  })

  it("shows the tail on request", async () => {
    const r = await diagnose({ jobName: "app", buildNumber: 3, tail: true })
    expect(r.summary).toContain("  last lines\n")
    expect(r.summary).not.toContain("last lines hidden")
  })

  it("takes a build URL, branch slash included", async () => {
    const r = await diagnose({ url: `${BASE_URL}/job/repo/job/feature%2Fx/4/` })
    expect(r).toMatchObject({
      job: "repo/feature/x",
      build: 4,
      result: "SUCCESS",
    })
    expect(r.summary).toContain("no failing stage or test found")
  })

  it("names what is missing", async () => {
    await expect(
      diagnose({ jobName: "app", buildNumber: 99 }),
    ).rejects.toMatchObject({ code: "BUILD_NOT_FOUND" })
    await expect(diagnose({ jobName: "nope" })).rejects.toMatchObject({
      code: "JOB_NOT_FOUND",
    })
    await expect(diagnose({ jobName: "empty" })).rejects.toMatchObject({
      code: "NO_BUILDS",
    })
    await expect(diagnose({})).rejects.toMatchObject({ code: "INVALID_INPUT" })
    await expect(diagnose({ jobName: "app", lines: 0 })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    })
  })

  it("is registered, read-only, with a handler", () => {
    const tool = rawTools.find((t) => t.name === "jenkins_diagnose_build")
    expect(tool?.annotations?.readOnlyHint).toBe(true)
    for (const t of rawTools.filter((t) => t.name !== "jenkins_list_instances"))
      expect(toolHandlers[t.name], `${t.name} has no handler`).toBeTypeOf(
        "function",
      )
  })
})

describe("formatDiagnosis", () => {
  const base = {
    job: "j",
    build: 1,
    result: "FAILURE",
    url: "",
    hints: [] as string[],
  }

  it("collapses a FAILED stage with only clean steps after a real failure", () => {
    const step = (status: string, errorLines: unknown[] | null) => ({
      name: "sh",
      status,
      logTail: "",
      errorLines,
      logLineCount: 3,
      reportLinks: [],
    })
    const text = formatDiagnosis({
      ...base,
      failedStages: [
        { name: "Build", status: "FAILED", steps: [step("FAILED", [])] },
        { name: "Publish", status: "FAILED", steps: [step("SUCCESS", [])] },
      ],
      tests: null,
    } as never)
    expect(text).toContain("skipped (earlier failure): Publish")
    expect(text).not.toContain("stage Publish")
  })

  it("reads an error signal stage on one line", () => {
    const text = formatDiagnosis({
      ...base,
      result: "UNSTABLE",
      failedStages: [
        {
          name: "Lint",
          status: "UNSTABLE",
          steps: [
            {
              name: "Error signal",
              status: "SUCCESS",
              logTail: "noise\n3 lint errors\n",
              errorLines: [],
              logLineCount: 2,
              reportLinks: [],
            },
          ],
        },
      ],
      tests: { failed: 0, total: 12, first: [] },
    } as never)
    expect(text).toContain("stage Lint  UNSTABLE  error signal: 3 lint errors")
    expect(text).toContain("  the failing stages above are not in this report")
  })

  it("counts failed tests beyond the ones it lists", () => {
    const text = formatDiagnosis({
      ...base,
      failedStages: [],
      tests: {
        failed: 12,
        total: 40,
        first: [{ name: "a.b", error: "boom\nstack", stackHead: null }],
      },
    } as never)
    expect(text).toContain("  ✗ a.b\n    boom\n  … 11 more")
  })
})

describe("parseBuildUrl", () => {
  it.each([
    [`${BASE_URL}/job/app/12/`, { jobName: "app", build: 12 }],
    [`${BASE_URL}/job/app/12/console`, { jobName: "app", build: 12 }],
    [
      `${BASE_URL}/job/Team/job/svc/lastFailedBuild/`,
      { jobName: "Team/svc", build: "lastFailedBuild" },
    ],
    [
      `${BASE_URL}/job/repo/job/feature%2Fx/`,
      { jobName: "repo/feature/x", build: undefined },
    ],
    [`${BASE_URL}/job/app/configure`, { jobName: "app", build: undefined }],
  ])("reads %s", (url, expected) => {
    expect(parseBuildUrl(url, BASE_URL)).toEqual(expected)
  })

  it("strips a base path the instance lives under", () => {
    expect(
      parseBuildUrl(
        "https://ci.example.com/jenkins/job/app/3/",
        "https://ci.example.com/jenkins",
      ),
    ).toEqual({
      jobName: "app",
      build: 3,
    })
  })

  it("refuses a URL with no job in it", () => {
    expect(() => parseBuildUrl(`${BASE_URL}/view/all/`, BASE_URL)).toThrow(
      /No Jenkins job/,
    )
    expect(() => parseBuildUrl("not a url", BASE_URL)).toThrow(/Not a URL/)
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { JenkinsClient } from "../../src/lib/jenkins-client.js"
import * as common from "../../src/common/index.js"

const mockFetchResponse = (body: unknown, setCookie?: string) =>
  Promise.resolve({
    ok: true,
    status: 200,
    headers: {
      get: (h: string) => (h === "set-cookie" ? (setCookie ?? null) : null),
      getSetCookie: () => (setCookie ? [setCookie] : []),
    },
    json: () => Promise.resolve(body),
  } as unknown as Response)

vi.mock("../../src/common/index.js", () => {
  class McpError extends Error {
    code: string
    status?: number
    constructor(code: string, message: string, status?: number) {
      super(message)
      this.code = code
      this.status = status
    }
  }
  return {
    DEFAULT_TIMEOUT_MS: 30000,
    httpGetJson: vi.fn(),
    httpGetText: vi.fn(),
    httpGetTextWithHeaders: vi.fn(),
    httpPost: vi.fn(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    loadJenkinsEnv: vi.fn(() => ({
      JENKINS_URL: "https://jenkins.example.com",
      JENKINS_USER: "testuser",
      JENKINS_API_TOKEN: "testtoken",
      JENKINS_TIMEOUT_MS: 30000,
    })),
    McpError,
    Errors: {
      authFailed: () => new Error("Authentication failed"),
      jobNotFound: (job: string) => new Error(`Job not found: ${job}`),
      buildNotFound: (job: string, build: number) =>
        new Error(`Build ${build} not found for job ${job}`),
      artifactNotFound: (path: string) =>
        new Error(`Artifact not found: ${path}`),
      invalidInput: (msg: string) =>
        new McpError("INVALID_INPUT", msg, 400),
      parametersRequired: (msg: string) =>
        new McpError("PARAMETERS_REQUIRED", msg, 400),
      noBuilds: (job: string) =>
        new McpError("NO_BUILDS", `Job ${job} has no builds yet`, 404),
      unexpected: (msg: string) => new Error(msg),
    },
  }
})

describe("JenkinsClient", () => {
  let client: JenkinsClient

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal("fetch", vi.fn())
    client = new JenkinsClient()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("constructor", () => {
    it("should use environment variables when no credentials provided", () => {
      const client = new JenkinsClient()
      expect(common.loadJenkinsEnv).toHaveBeenCalled()
    })

    it("should use provided credentials over environment", () => {
      const creds = {
        baseUrl: "https://custom.jenkins.com",
        authHeader: "Bearer custom-token",
      }
      const client = new JenkinsClient(creds)
      // Client should not load env when credentials are provided
      expect(client).toBeDefined()
    })
  })

  describe("listJobs", () => {
    it("should return list of jobs", async () => {
      const mockResponse = {
        jobs: [
          { name: "job-1", url: "https://jenkins.example.com/job/job-1" },
          { name: "job-2", url: "https://jenkins.example.com/job/job-2" },
        ],
      }
      vi.mocked(common.httpGetJson).mockResolvedValue(mockResponse)

      const jobs = await client.listJobs()

      expect(jobs).toEqual([
        { name: "job-1", url: "https://jenkins.example.com/job/job-1" },
        { name: "job-2", url: "https://jenkins.example.com/job/job-2" },
      ])
      expect(common.httpGetJson).toHaveBeenCalledWith(
        "https://jenkins.example.com/api/json?tree=jobs%5Bname%2Curl%2C_class%2Cjobs%5Bname%5D%5D",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.any(String),
          }),
        }),
      )
    })

    it("should recursively list jobs in nested folders using full names", async () => {
      vi.mocked(common.httpGetJson)
        .mockResolvedValueOnce({
          jobs: [
            {
              name: "Sandbox",
              url: "https://jenkins.example.com/job/Sandbox/",
              _class: "com.cloudbees.hudson.plugins.folder.Folder",
              jobs: [{ name: "acceptance-logging-sandbox" }],
            },
          ],
        })
        .mockResolvedValueOnce({
          jobs: [
            {
              name: "acceptance-logging-sandbox",
              url: "https://jenkins.example.com/job/Sandbox/job/acceptance-logging-sandbox/",
              _class: "org.jenkinsci.plugins.workflow.job.WorkflowJob",
            },
            {
              name: "Team",
              url: "https://jenkins.example.com/job/Sandbox/job/Team/",
              _class: "com.cloudbees.hudson.plugins.folder.Folder",
              jobs: [{ name: "deep-job" }],
            },
          ],
        })
        .mockResolvedValueOnce({
          jobs: [
            {
              name: "deep-job",
              url: "https://jenkins.example.com/job/Sandbox/job/Team/job/deep-job/",
              _class: "org.jenkinsci.plugins.workflow.job.WorkflowJob",
            },
          ],
        })

      const jobs = await client.listJobs({ recursive: true })

      expect(jobs.map((job) => job.name)).toEqual([
        "Sandbox",
        "Sandbox/acceptance-logging-sandbox",
        "Sandbox/Team",
        "Sandbox/Team/deep-job",
      ])
      expect(common.httpGetJson).toHaveBeenNthCalledWith(
        2,
        "https://jenkins.example.com/job/Sandbox/api/json?tree=jobs%5Bname%2Curl%2C_class%2Cjobs%5Bname%5D%5D",
        expect.anything(),
      )
      expect(common.httpGetJson).toHaveBeenNthCalledWith(
        3,
        "https://jenkins.example.com/job/Sandbox/job/Team/api/json?tree=jobs%5Bname%2Curl%2C_class%2Cjobs%5Bname%5D%5D",
        expect.anything(),
      )
    })

    // Recursion is opt-in because traversal is one sequential request per
    // folder. A true default would give every existing caller that cost without
    // their call site changing, so this pins the single request.
    it("should not traverse nested folders unless recursion is requested", async () => {
      vi.mocked(common.httpGetJson).mockResolvedValueOnce({
        jobs: [
          {
            name: "Sandbox",
            url: "https://jenkins.example.com/job/Sandbox/",
            _class: "com.cloudbees.hudson.plugins.folder.Folder",
            jobs: [{ name: "acceptance-logging-sandbox" }],
          },
        ],
      })

      const jobs = await client.listJobs()

      expect(jobs.map((job) => job.name)).toEqual(["Sandbox"])
      expect(common.httpGetJson).toHaveBeenCalledTimes(1)
    })

    // Multibranch projects hold one child per discovered branch, so descending
    // into them makes traversal cost scale with branch count.
    it("should not descend into multibranch projects", async () => {
      vi.mocked(common.httpGetJson).mockResolvedValueOnce({
        jobs: [
          {
            name: "my-service",
            url: "https://jenkins.example.com/job/my-service/",
            _class:
              "org.jenkinsci.plugins.workflow.multibranch.WorkflowMultiBranchProject",
          },
        ],
      })

      const jobs = await client.listJobs({ recursive: true })

      expect(jobs.map((job) => job.name)).toEqual(["my-service"])
      expect(common.httpGetJson).toHaveBeenCalledTimes(1)
    })

    // NaN survives Math.floor/max/min and `depth < NaN` is always false, so an
    // unguarded non-numeric depth returns only the top level and reads as an
    // empty folder.
    it("should fall back to the default depth when maxDepth is not a number", async () => {
      vi.mocked(common.httpGetJson)
        .mockResolvedValueOnce({
          jobs: [
            {
              name: "Sandbox",
              url: "https://jenkins.example.com/job/Sandbox/",
              _class: "com.cloudbees.hudson.plugins.folder.Folder",
              jobs: [{ name: "nested" }],
            },
          ],
        })
        .mockResolvedValueOnce({
          jobs: [
            {
              name: "nested",
              url: "https://jenkins.example.com/job/Sandbox/job/nested/",
              _class: "org.jenkinsci.plugins.workflow.job.WorkflowJob",
            },
          ],
        })

      const jobs = await client.listJobs({
        recursive: true,
        maxDepth: Number.NaN,
      })

      expect(jobs.map((job) => job.name)).toEqual(["Sandbox", "Sandbox/nested"])
    })

    it("should list a selected folder and omit folder entries when requested", async () => {
      vi.mocked(common.httpGetJson)
        .mockResolvedValueOnce({
          jobs: [
            {
              name: "acceptance-logging-sandbox",
              url: "https://jenkins.example.com/job/Sandbox/job/acceptance-logging-sandbox/",
              _class: "org.jenkinsci.plugins.workflow.job.WorkflowJob",
            },
            {
              name: "Team",
              url: "https://jenkins.example.com/job/Sandbox/job/Team/",
              _class: "com.cloudbees.hudson.plugins.folder.Folder",
              jobs: [{ name: "deep-job" }],
            },
          ],
        })
        .mockResolvedValueOnce({
          jobs: [
            {
              name: "deep-job",
              url: "https://jenkins.example.com/job/Sandbox/job/Team/job/deep-job/",
              _class: "org.jenkinsci.plugins.workflow.job.WorkflowJob",
            },
          ],
        })

      const jobs = await client.listJobs({
        folder: "Sandbox",
        includeFolders: false,
        recursive: true,
      })

      expect(jobs.map((job) => job.name)).toEqual([
        "Sandbox/acceptance-logging-sandbox",
        "Sandbox/Team/deep-job",
      ])
      expect(common.httpGetJson).toHaveBeenNthCalledWith(
        1,
        "https://jenkins.example.com/job/Sandbox/api/json?tree=jobs%5Bname%2Curl%2C_class%2Cjobs%5Bname%5D%5D",
        expect.anything(),
      )
    })

    it("should return empty array when no jobs", async () => {
      vi.mocked(common.httpGetJson).mockResolvedValue({ jobs: null })

      const jobs = await client.listJobs()

      expect(jobs).toEqual([])
    })

    it("should throw auth error on 401", async () => {
      vi.mocked(common.httpGetJson).mockRejectedValue(new Error("HTTP 401"))

      await expect(client.listJobs()).rejects.toThrow("Authentication failed")
    })
  })

  describe("getRecentBuilds", () => {
    it("should return recent builds with normalized data", async () => {
      const mockResponse = {
        builds: [
          {
            number: 100,
            result: "SUCCESS",
            duration: 5000,
            timestamp: 1698768000000,
            url: "https://jenkins.example.com/job/test-job/100/",
            building: false,
          },
          {
            number: 99,
            result: "FAILURE",
            duration: 3000,
            timestamp: 1698764400000,
            url: "https://jenkins.example.com/job/test-job/99/",
            building: false,
          },
        ],
      }
      vi.mocked(common.httpGetJson).mockResolvedValue(mockResponse)

      const builds = await client.getRecentBuilds("test-job", 2)

      expect(builds).toHaveLength(2)
      expect(builds[0]).toMatchObject({
        id: "100",
        result: "SUCCESS",
        durationMs: 5000,
      })
      expect(builds[1]).toMatchObject({
        id: "99",
        result: "FAILURE",
        durationMs: 3000,
      })
    })

    it("should mark building jobs as RUNNING", async () => {
      const mockResponse = {
        builds: [
          {
            number: 101,
            building: true,
            duration: 0,
            timestamp: Date.now(),
            url: "https://jenkins.example.com/job/test-job/101/",
          },
        ],
      }
      vi.mocked(common.httpGetJson).mockResolvedValue(mockResponse)

      const builds = await client.getRecentBuilds("test-job", 1)

      expect(builds[0].result).toBe("RUNNING")
    })

    it("should throw job not found error on 404", async () => {
      vi.mocked(common.httpGetJson).mockRejectedValue(new Error("HTTP 404"))

      await expect(client.getRecentBuilds("nonexistent-job")).rejects.toThrow(
        "Job not found: nonexistent-job",
      )
    })
  })

  describe("getLastBuild", () => {
    it("should return last build normalized", async () => {
      const mockResponse = {
        number: 42,
        result: "SUCCESS",
        duration: 10000,
        timestamp: 1698768000000,
        url: "https://jenkins.example.com/job/my-job/42/",
        building: false,
      }
      vi.mocked(common.httpGetJson).mockResolvedValue(mockResponse)

      const build = await client.getLastBuild("my-job")

      expect(build).toMatchObject({
        id: "42",
        result: "SUCCESS",
        durationMs: 10000,
      })
    })

    it("throws NO_BUILDS when the job exists but has never been built", async () => {
      vi.mocked(common.httpGetJson)
        .mockRejectedValueOnce(new Error("HTTP 404")) // lastBuild
        .mockResolvedValueOnce({ name: "fresh-job" }) // job probe

      const err = await client.getLastBuild("fresh-job").then(
        () => null,
        (e) => e as any,
      )

      expect(err.code).toBe("NO_BUILDS")
      expect(err.message).toBe("Job fresh-job has no builds yet")
    })

    it("keeps JOB_NOT_FOUND when the job itself is missing", async () => {
      vi.mocked(common.httpGetJson).mockRejectedValue(new Error("HTTP 404"))

      await expect(client.getLastBuild("gone-job")).rejects.toThrow(
        "Job not found: gone-job",
      )
    })
  })

  describe("getBuild", () => {
    it("should return specific build", async () => {
      const mockResponse = {
        number: 55,
        result: "ABORTED",
        duration: 2000,
        timestamp: 1698768000000,
        url: "https://jenkins.example.com/job/my-job/55/",
        building: false,
      }
      vi.mocked(common.httpGetJson).mockResolvedValue(mockResponse)

      const build = await client.getBuild("my-job", 55)

      expect(build.id).toBe("55")
      expect(build.result).toBe("ABORTED")
    })
  })

  describe("getConsoleLog", () => {
    // The default contract: the tail of the log, never the whole thing, with
    // truncation metadata telling the caller what was left out.
    it("returns the last 500 lines, truncated, on a longer log", async () => {
      const lines: string[] = []
      for (let i = 1; i <= 600; i++) lines.push(`Line ${i}`)
      const fullLog = lines.join("\n") + "\n"
      vi.mocked(common.httpGetText).mockResolvedValue(fullLog)
      vi.mocked(common.httpGetJson).mockResolvedValue({ number: 10 })

      const result = await client.getConsoleLog("acme/api-gateway/PR-123", 10)

      expect(result.truncated).toBe(true)
      expect(result.totalBytes).toBe(Buffer.byteLength(fullLog, "utf8"))
      // startByte is a true resume offset into the full log.
      expect(result.startByte + result.returnedBytes).toBe(result.totalBytes)
      expect(result.text).toBe(lines.slice(100).join("\n") + "\n")
      // The last 500 lines: the head must be gone from the returned text.
      expect(result.text).not.toContain("Line 1\n")
      expect(result.text).toContain("Line 101\n")
      expect(result.text).toContain("Line 600")
    })

    it("cuts the byte cap at a line boundary when lines are very long", async () => {
      // 8 lines of ~60 KB each: 500-line window is never the constraint, the
      // 204800-byte cap is.
      const fullLog = Array.from({ length: 8 }, (_, i) =>
        `${i} ` + "x".repeat(60000),
      ).join("\n")
      vi.mocked(common.httpGetText).mockResolvedValue(fullLog)
      vi.mocked(common.httpGetJson).mockResolvedValue({ number: 7 })

      const result = await client.getConsoleLog("acme/web", 7)

      expect(result.truncated).toBe(true)
      expect(result.returnedBytes).toBeLessThanOrEqual(204800)
      expect(result.returnedBytes).toBeGreaterThan(60000) // more than one line fits
      expect(result.text).toMatch(/\n$/) // the cap cut on a line boundary
      expect(result.text!.split("\n").length).toBe(4) // 3 whole lines plus the join after the last
    })

    it("returns a short log whole with truncated false and totalBytes", async () => {
      const fullLog = "Line 1\nLine 2\nLine 3\n"
      vi.mocked(common.httpGetText).mockResolvedValue(fullLog)
      vi.mocked(common.httpGetJson).mockResolvedValue({ number: 10 })

      const result = await client.getConsoleLog("acme/web", 10, {
        maxBytes: 204800,
      })

      expect(result.truncated).toBe(false)
      expect(result.text).toBe(fullLog)
      expect(result.startByte).toBe(0)
      expect(result.totalBytes).toBe(Buffer.byteLength(fullLog, "utf8"))
    })

    it("keeps logSnippet from the fetched log", async () => {
      const fullLog = "First line of the log\nSecond line\n"
      vi.mocked(common.httpGetText).mockResolvedValue(fullLog)
      vi.mocked(common.httpGetJson).mockResolvedValue({ number: 3 })

      const result = await client.getConsoleLog("acme/web", 3, {
        maxSnippetLength: 10,
      })

      expect(result.logSnippet).toBe("First line")
    })

    // Previous contract: the third argument used to be maxSnippetLength as a
    // bare number. A direct importer calling getConsoleLog("acme/web", 10, 50)
    // must still get a 50-character snippet, alongside the new capped text and
    // the removed fullLog.
    it("keeps the bare-number third argument meaning maxSnippetLength", async () => {
      const fullLog = "S" + "p".repeat(99) + "ider\nWait\n"
      vi.mocked(common.httpGetText).mockResolvedValue(fullLog)
      vi.mocked(common.httpGetJson).mockResolvedValue({ number: 10 })

      const result = await client.getConsoleLog("acme/web", 10, 50)

      expect(result.logSnippet).toHaveLength(50)
      expect(result.truncated).toBe(false)
      expect(result.text).toBe(fullLog)
      expect((result as any).fullLog).toBeUndefined()
    })

    // Deliberate breaking change: the old contract returned `fullLog` with the
    // whole log in the result, and that one JSON-RPC message could blow past an
    // MCP client's 16 MB per-message cap, disconnecting the client and dropping
    // the server's tools. A caller that used to read fullLog now gets the
    // capped tail text instead and must page (start) or search (pattern) for
    // the rest.
    it("never returns fullLog: previous-contract callers get the capped text instead", async () => {
      const fullLog = Array.from({ length: 600 }, (_, i) => `Line ${i + 1}`).join("\n")
      vi.mocked(common.httpGetText).mockResolvedValue(fullLog)
      vi.mocked(common.httpGetJson).mockResolvedValue({ number: 10 })

      const result = await client.getConsoleLog("acme/api-gateway/PR-123", 10)

      expect((result as any).fullLog).toBeUndefined()
      expect(Buffer.byteLength(result.text!, "utf8")).toBeLessThan(
        Buffer.byteLength(fullLog, "utf8"),
      )
    })

    it("defaults to fetching the last build when buildNumber is omitted", async () => {
      vi.mocked(common.httpGetJson).mockResolvedValueOnce({
        number: 15,
        result: "SUCCESS",
        duration: 1000,
        timestamp: 1698768000000,
        url: "https://jenkins.example.com/job/acme/job/web/15/",
        building: false,
      })
      vi.mocked(common.httpGetText).mockResolvedValue("log\n")

      const result = await client.getConsoleLog("acme/web")

      expect(result.buildNumber).toBe(15)
    })

    it("rejects a start that is not a non-negative whole number", async () => {
      await expect(
        client.getConsoleLog("acme/web", 1, { start: -1 }),
      ).rejects.toThrow(/non-negative whole number/)
      await expect(
        client.getConsoleLog("acme/web", 1, { start: 1.5 }),
      ).rejects.toThrow(/non-negative whole number/)
      expect(common.httpGetText).not.toHaveBeenCalled()
      expect(common.httpGetTextWithHeaders).not.toHaveBeenCalled()
    })

    it("rejects a maxBytes that is not a positive whole number", async () => {
      await expect(
        client.getConsoleLog("acme/web", 1, { maxBytes: 0 }),
      ).rejects.toThrow(/positive whole number/)
      await expect(
        client.getConsoleLog("acme/web", 1, { maxBytes: -100 }),
      ).rejects.toThrow(/positive whole number/)
      await expect(
        client.getConsoleLog("acme/web", 1, { maxBytes: 1.5 }),
      ).rejects.toThrow(/positive whole number/)
      expect(common.httpGetText).not.toHaveBeenCalled()
    })

    it("accepts start: 0 and pages the head of the log through progressiveText", async () => {
      vi.mocked(common.httpGetTextWithHeaders).mockResolvedValue({
        text: "head of the log\n",
        headers: { "x-text-size": "16", "x-more-data": "true" },
      })
      vi.mocked(common.httpGetJson).mockResolvedValue({ number: 22 })

      const result = await client.getConsoleLog("acme/api-gateway/PR-123", 22, {
        start: 0,
        maxBytes: 100,
      })

      expect(common.httpGetTextWithHeaders).toHaveBeenCalledWith(
        "https://jenkins.example.com/job/acme/job/api-gateway/job/PR-123/22/logText/progressiveText?start=0",
        expect.anything(),
      )
      expect(result.text).toBe("head of the log\n")
      expect(result.startByte).toBe(0)
      expect(result.nextStart).toBe(16) // X-Text-Size: the offset Jenkins reports to resume from
      expect(result.moreData).toBe(true)
      expect(result.truncated).toBe(false)
    })

    it("slices an oversized progressive chunk to maxBytes and reports the resume offset", async () => {
      const chunk = `${"a".repeat(200)}\n${"b".repeat(200)}\n${"c".repeat(200)}\n`
      vi.mocked(common.httpGetTextWithHeaders).mockResolvedValue({
        text: chunk,
        headers: { "x-text-size": "603", "x-more-data": "false" },
      })
      vi.mocked(common.httpGetJson).mockResolvedValue({ number: 4 })

      const result = await client.getConsoleLog("acme/web", 4, {
        start: 5000,
        maxBytes: 400,
      })

      expect(result.truncated).toBe(true)
      expect(result.returnedBytes).toBeLessThanOrEqual(400)
      expect(result.nextStart).toBe(5000 + result.returnedBytes)
      expect(result.moreData).toBe(false)
    })

    it("falls back to start + returned bytes when the response text is cut and Jenkins sent no usable X-Text-Size", async () => {
      const chunk = `${"y".repeat(300)}\n${"z".repeat(300)}\n`
      vi.mocked(common.httpGetTextWithHeaders).mockResolvedValue({
        text: chunk,
        headers: {},
      })
      vi.mocked(common.httpGetJson).mockResolvedValue({ number: 4 })

      const result = await client.getConsoleLog("acme/web", 4, {
        start: 128,
        maxBytes: 320,
      })

      expect(result.truncated).toBe(true)
      expect(result.nextStart).toBe(128 + result.returnedBytes)
    })

    it("rejects a non-string pattern, and passes a string one through", async () => {
      await expect(
        client.getConsoleLog("acme/web", 1, {
          pattern: 5 as unknown as string,
        }),
      ).rejects.toThrow(/pattern must be a string/)
      expect(common.httpGetJson).not.toHaveBeenCalled()
    })

    it("treats a compiling pattern as a regex over the whole log and numbers hits", async () => {
      // 800 lines so the tail default is never in play; the pattern searches
      // the entire log, not just the last 500 lines.
      const lines: string[] = []
      for (let i = 1; i <= 800; i++)
        lines.push(i % 100 === 0 ? `ERROR at step ${i}` : `ok step ${i}`)
      vi.mocked(common.httpGetText).mockResolvedValue(lines.join("\n") + "\n")
      vi.mocked(common.httpGetJson).mockResolvedValue({ number: 30 })

      const result = await client.getConsoleLog("acme/api-gateway/PR-123", 30, {
        pattern: "^ERROR at step (\\d+)$",
      })

      expect(result.totalMatches).toBe(8)
      expect(result.truncated).toBe(false)
      expect(result.pattern).toBe("^ERROR at step (\\d+)$")
      expect(result.matches).toEqual(
        [100, 200, 300, 400, 500, 600, 700, 800].map((n) => ({
          line: n,
          text: `ERROR at step ${n}`,
        })),
      )
    })

    it("falls back to a plain substring match when the pattern does not compile", async () => {
      vi.mocked(common.httpGetText).mockResolvedValue(
        "ERROR(not found)\nok\nERROR(ok)\n",
      )
      vi.mocked(common.httpGetJson).mockResolvedValue({ number: 2 })

      const result = await client.getConsoleLog("acme/web", 2, {
        pattern: "ERROR(",
      })

      expect(result.totalMatches).toBe(2)
      expect(result.matches).toEqual([
        { line: 1, text: "ERROR(not found)" },
        { line: 3, text: "ERROR(ok)" },
      ])
    })

    it("caps matches at 500 and reports the total", async () => {
      const lines = Array.from(
        { length: 700 },
        (_, i) => `MISS ${i + 1}`,
      )
      vi.mocked(common.httpGetText).mockResolvedValue(lines.join("\n") + "\n")
      vi.mocked(common.httpGetJson).mockResolvedValue({ number: 9 })

      const result = await client.getConsoleLog("acme/web", 9, {
        pattern: "MISS",
      })

      expect(result.matches).toHaveLength(500)
      expect(result.totalMatches).toBe(700)
      expect(result.truncated).toBe(true)
      expect(result.returnedBytes).toBeLessThanOrEqual(204800)
    })

    it("still maps a 404 on the log fetch to build not found", async () => {
      vi.mocked(common.httpGetText).mockRejectedValue(new Error("HTTP 404"))
      vi.mocked(common.httpGetJson).mockResolvedValueOnce({ name: "acme/web" })

      await expect(client.getConsoleLog("acme/web", 12)).rejects.toThrow(
        "Build 12 not found for job acme/web",
      )
    })

    it("still maps a 404 on a paged fetch to build not found", async () => {
      vi.mocked(common.httpGetTextWithHeaders).mockRejectedValue(
        new Error("HTTP 404"),
      )
      vi.mocked(common.httpGetJson).mockResolvedValueOnce({ name: "acme/web" })

      await expect(
        client.getConsoleLog("acme/web", 12, { start: 0 }),
      ).rejects.toThrow("Build 12 not found for job acme/web")
    })
  })

  describe("triggerBuild", () => {
    // Every trigger now reads the job's parameter definitions first, so each
    // test seeds the lookup: `property: []` is a job with no parameters.
    const jobDefs = (
      defs: { name: string; type?: string; default?: any }[],
    ) => ({
      property: [
        {
          _class: "hudson.model.ParametersDefinitionProperty",
          parameterDefinitions: defs.map((d) => ({
            name: d.name,
            type: d.type,
            defaultParameterValue: d.default === undefined ? undefined : { value: d.default },
          })),
        },
      ],
    })
    const DEPLOY_DEFS = jobDefs([
      { name: "DEPLOY_TO_QA", type: "BooleanParameterDefinition", default: true },
      { name: "REGION", type: "ChoiceParameterDefinition", default: "eu-west-1" },
    ])

    it("should trigger build without parameters", async () => {
      vi.mocked(common.httpGetJson).mockResolvedValue(jobDefs([]))
      const mockCrumb = { crumbRequestField: "Jenkins-Crumb", crumb: "abc123" }
      vi.mocked(fetch).mockReturnValue(mockFetchResponse(mockCrumb))
      vi.mocked(common.httpPost).mockResolvedValue({
        status: 201,
        headers: { location: "https://jenkins.example.com/queue/item/123/" },
      })

      const result = await client.triggerBuild("my-job")

      expect(result.jobName).toBe("my-job")
      expect(result.queueUrl).toBe(
        "https://jenkins.example.com/queue/item/123/",
      )
      expect(common.httpPost).toHaveBeenCalledWith(
        "https://jenkins.example.com/job/my-job/build",
        expect.objectContaining({
          headers: expect.objectContaining({
            "Jenkins-Crumb": "abc123",
          }),
        }),
      )
    })

    it("should trigger build with parameters", async () => {
      vi.mocked(common.httpGetJson).mockResolvedValue(
        jobDefs([{ name: "branch" }, { name: "tag" }]),
      )
      const mockCrumb = { crumbRequestField: "Jenkins-Crumb", crumb: "xyz789" }
      vi.mocked(fetch).mockReturnValue(mockFetchResponse(mockCrumb))
      vi.mocked(common.httpPost).mockResolvedValue({
        status: 201,
        headers: { location: "https://jenkins.example.com/queue/item/456/" },
      })

      const result = await client.triggerBuild("my-job", {
        branch: "main",
        tag: "v1.0",
      })

      expect(common.httpPost).toHaveBeenCalledWith(
        "https://jenkins.example.com/job/my-job/buildWithParameters",
        expect.objectContaining({
          headers: expect.objectContaining({
            "Content-Type": "application/x-www-form-urlencoded",
          }),
          body: expect.stringContaining("branch=main"),
        }),
      )
    })

    it("re-issues the crumb and retries once when the cached session goes stale", async () => {
      vi.mocked(common.httpGetJson)
        .mockResolvedValueOnce(jobDefs([]))
        .mockResolvedValueOnce(jobDefs([{ name: "branch" }]))
      vi.mocked(fetch)
        .mockReturnValueOnce(
          mockFetchResponse(
            { crumbRequestField: "Jenkins-Crumb", crumb: "old" },
            "JSESSIONID=old; Path=/",
          ),
        )
        .mockReturnValueOnce(
          mockFetchResponse(
            { crumbRequestField: "Jenkins-Crumb", crumb: "new" },
            "JSESSIONID=new; Path=/",
          ),
        )
      vi.mocked(common.httpPost)
        .mockResolvedValueOnce({
          status: 201,
          headers: { location: "https://jenkins.example.com/queue/item/1/" },
        })
        .mockResolvedValueOnce({ status: 403, headers: {} })
        .mockResolvedValueOnce({
          status: 201,
          headers: { location: "https://jenkins.example.com/queue/item/2/" },
        })

      await client.triggerBuild("my-job")
      const result = await client.triggerBuild("my-job", { branch: "main" })

      expect(result.queueUrl).toBe("https://jenkins.example.com/queue/item/2/")
      expect(fetch).toHaveBeenCalledTimes(2)
      const retry = vi.mocked(common.httpPost).mock.calls[2][1] as any
      expect(retry.headers["Jenkins-Crumb"]).toBe("new")
      expect(retry.headers.Cookie).toBe("JSESSIONID=new")
      expect(retry.headers["Content-Type"]).toBe(
        "application/x-www-form-urlencoded",
      )
      expect(retry.body).toBe("branch=main")
    })

    it("throws instead of returning a null queueUrl when Jenkins refuses the trigger", async () => {
      vi.mocked(common.httpGetJson).mockResolvedValue(jobDefs([]))
      vi.mocked(fetch).mockReturnValue(
        mockFetchResponse({ crumbRequestField: "Jenkins-Crumb", crumb: "c" }),
      )
      vi.mocked(common.httpPost).mockResolvedValue({ status: 403, headers: {} })

      await expect(client.triggerBuild("my-job")).rejects.toThrow("HTTP 403")
      expect(common.httpPost).toHaveBeenCalledTimes(2)
    })

    it("maps a 404 trigger response to job not found", async () => {
      vi.mocked(common.httpGetJson).mockResolvedValue(jobDefs([]))
      vi.mocked(fetch).mockReturnValue(
        mockFetchResponse({ crumbRequestField: "Jenkins-Crumb", crumb: "c" }),
      )
      vi.mocked(common.httpPost).mockResolvedValue({ status: 404, headers: {} })

      await expect(client.triggerBuild("missing")).rejects.toThrow(
        "Job not found: missing",
      )
    })

    it("captures Set-Cookie from crumb fetch and injects Cookie on POST", async () => {
      vi.mocked(common.httpGetJson).mockResolvedValue(jobDefs([]))
      const mockCrumb = {
        crumbRequestField: "Jenkins-Crumb",
        crumb: "cookie123",
      }
      vi.mocked(fetch).mockReturnValue(
        mockFetchResponse(mockCrumb, "JSESSIONID=abc123; Path=/"),
      )
      vi.mocked(common.httpPost).mockResolvedValue({
        status: 201,
        headers: { location: "/queue/1" },
      })

      await client.triggerBuild("my-job")

      expect(common.httpPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Cookie: "JSESSIONID=abc123",
          }),
        }),
      )
    })

    it("returns the queue URL from a 201 response with a Location header", async () => {
      vi.mocked(common.httpGetJson).mockResolvedValue(jobDefs([]))
      vi.mocked(fetch).mockReturnValue(
        mockFetchResponse({ crumbRequestField: "Jenkins-Crumb", crumb: "c" }),
      )
      vi.mocked(common.httpPost).mockResolvedValue({
        status: 201,
        headers: { location: "https://jenkins.example.com/queue/item/7/" },
      })

      await expect(client.triggerBuild("my-job")).resolves.toEqual({
        jobName: "my-job",
        queueUrl: "https://jenkins.example.com/queue/item/7/",
      })
    })

    // fetch follows redirects by default, which turns an authentication
    // redirect into a 200 HTML page that reads as a queued build. The trigger
    // POSTs must ask not to follow so the redirect itself surfaces.
    it("sends the trigger POST asking not to follow redirects", async () => {
      vi.mocked(common.httpGetJson).mockResolvedValue(
        jobDefs([{ name: "branch" }]),
      )
      vi.mocked(fetch).mockReturnValue(
        mockFetchResponse({ crumbRequestField: "Jenkins-Crumb", crumb: "c" }),
      )
      vi.mocked(common.httpPost).mockResolvedValue({
        status: 201,
        headers: { location: "https://jenkins.example.com/queue/item/8/" },
      })

      await client.triggerBuild("my-job", { branch: "main" })

      for (const call of vi.mocked(common.httpPost).mock.calls) {
        expect(call[1]).toMatchObject({ redirect: "manual" })
      }
    })

    it("rejects a 2xx trigger response with no queue Location header", async () => {
      vi.mocked(common.httpGetJson).mockResolvedValue(jobDefs([]))
      vi.mocked(fetch).mockReturnValue(
        mockFetchResponse({ crumbRequestField: "Jenkins-Crumb", crumb: "c" }),
      )
      vi.mocked(common.httpPost).mockResolvedValue({ status: 200, headers: {} })

      const err = await client
        .triggerBuild("my-job")
        .then(
          () => null,
          (e) => e as Error,
        )

      expect(err).toBeTruthy()
      expect(err?.message).toContain("HTTP 200")
      expect(err?.message).toContain(
        "https://jenkins.example.com/job/my-job/build",
      )
    })

    it("rejects a redirect trigger response instead of following it", async () => {
      vi.mocked(common.httpGetJson).mockResolvedValue(jobDefs([]))
      vi.mocked(fetch).mockReturnValue(
        mockFetchResponse({ crumbRequestField: "Jenkins-Crumb", crumb: "c" }),
      )
      vi.mocked(common.httpPost).mockResolvedValue({
        status: 302,
        headers: { location: "https://jenkins.example.com/login" },
      })

      await expect(client.triggerBuild("my-job")).rejects.toThrow(
        "Trigger build failed: HTTP 302 for https://jenkins.example.com/job/my-job/build (redirects to https://jenkins.example.com/login; not followed)",
      )
      expect(common.httpPost).toHaveBeenCalledTimes(1)
    })

    it("POSTs to buildWithParameters with the form body when all parameters are passed", async () => {
      vi.mocked(common.httpGetJson).mockResolvedValue(DEPLOY_DEFS)
      vi.mocked(fetch).mockReturnValue(
        mockFetchResponse({ crumbRequestField: "Jenkins-Crumb", crumb: "c" }),
      )
      vi.mocked(common.httpPost).mockResolvedValue({
        status: 201,
        headers: { location: "https://jenkins.example.com/queue/item/9/" },
      })

      const result = await client.triggerBuild("acme/api-gateway/PR-123", {
        DEPLOY_TO_QA: false,
        REGION: "eu-west-2",
      })

      expect(result.queueUrl).toBe(
        "https://jenkins.example.com/queue/item/9/",
      )
      expect(common.httpPost).toHaveBeenCalledWith(
        "https://jenkins.example.com/job/acme/job/api-gateway/job/PR-123/buildWithParameters",
        expect.objectContaining({ body: "DEPLOY_TO_QA=false&REGION=eu-west-2" }),
      )
    })

    // The previous contract POSTed /build and got a bare HTTP 400 back. It now
    // refuses before any POST is made, naming every missing parameter.
    it("refuses with PARAMETERS_REQUIRED when parameters are missing and useDefaults is not set", async () => {
      vi.mocked(common.httpGetJson).mockResolvedValue(DEPLOY_DEFS)
      vi.mocked(fetch).mockReturnValue(
        mockFetchResponse({ crumbRequestField: "Jenkins-Crumb", crumb: "c" }),
      )

      const err = await client
        .triggerBuild("acme/api-gateway/PR-123", { REGION: "eu-west-2" })
        .then(
          () => null,
          (e) => e as any,
        )

      expect(err.code).toBe("PARAMETERS_REQUIRED")
      expect(err.message).toBe(
        "Job acme/api-gateway/PR-123 has parameters that were not passed: " +
          "DEPLOY_TO_QA (BooleanParameterDefinition, default true). " +
          "Pass them in params, or set useDefaults: true to let Jenkins fill them.",
      )
      expect(common.httpPost).not.toHaveBeenCalled()
    })

    it("refuses with PARAMETERS_REQUIRED when no parameters at all were passed", async () => {
      vi.mocked(common.httpGetJson).mockResolvedValue(DEPLOY_DEFS)
      vi.mocked(fetch).mockReturnValue(
        mockFetchResponse({ crumbRequestField: "Jenkins-Crumb", crumb: "c" }),
      )

      const err = await client
        .triggerBuild("acme/api-gateway/PR-123")
        .then(
          () => null,
          (e) => e as any,
        )

      expect(err.code).toBe("PARAMETERS_REQUIRED")
      expect(err.message).toBe(
        "Job acme/api-gateway/PR-123 has parameters that were not passed: " +
          "DEPLOY_TO_QA (BooleanParameterDefinition, default true), " +
          "REGION (ChoiceParameterDefinition, default eu-west-1). " +
          "Pass them in params, or set useDefaults: true to let Jenkins fill them.",
      )
      expect(common.httpPost).not.toHaveBeenCalled()
    })

    it("lets Jenkins fill the defaults when useDefaults is true", async () => {
      vi.mocked(common.httpGetJson).mockResolvedValue(DEPLOY_DEFS)
      vi.mocked(fetch).mockReturnValue(
        mockFetchResponse({ crumbRequestField: "Jenkins-Crumb", crumb: "c" }),
      )
      vi.mocked(common.httpPost).mockResolvedValue({
        status: 201,
        headers: { location: "https://jenkins.example.com/queue/item/10/" },
      })

      const result = await client.triggerBuild(
        "acme/api-gateway/PR-123",
        {},
        { useDefaults: true },
      )

      expect(result.queueUrl).toBe(
        "https://jenkins.example.com/queue/item/10/",
      )
      // Parameterised endpoint even with an empty params set
      expect(common.httpPost).toHaveBeenCalledWith(
        "https://jenkins.example.com/job/acme/job/api-gateway/job/PR-123/buildWithParameters",
        expect.objectContaining({
          headers: expect.objectContaining({
            "Content-Type": "application/x-www-form-urlencoded",
          }),
          body: "",
        }),
      )
    })

    it("refuses with INVALID_INPUT for a parameter the job does not define", async () => {
      vi.mocked(common.httpGetJson).mockResolvedValue(DEPLOY_DEFS)
      vi.mocked(fetch).mockReturnValue(
        mockFetchResponse({ crumbRequestField: "Jenkins-Crumb", crumb: "c" }),
      )

      const err = await client
        .triggerBuild("acme/api-gateway/PR-123", { VERSION: "1.2.3" })
        .then(
          () => null,
          (e) => e as any,
        )

      expect(err.code).toBe("INVALID_INPUT")
      expect(err.message).toBe(
        "Unknown parameters for job acme/api-gateway/PR-123: VERSION. " +
          "Valid parameters: DEPLOY_TO_QA, REGION.",
      )
      expect(common.httpPost).not.toHaveBeenCalled()
    })

    it("refuses params passed to a job that takes no parameters", async () => {
      vi.mocked(common.httpGetJson).mockResolvedValue(jobDefs([]))
      vi.mocked(fetch).mockReturnValue(
        mockFetchResponse({ crumbRequestField: "Jenkins-Crumb", crumb: "c" }),
      )

      const err = await client
        .triggerBuild("acme/web", { VERSION: "1.2.3" })
        .then(
          () => null,
          (e) => e as any,
        )

      expect(err.code).toBe("INVALID_INPUT")
      expect(err.message).toBe(
        "Unknown parameters for job acme/web: VERSION. This job takes no parameters.",
      )
      expect(common.httpPost).not.toHaveBeenCalled()
    })

    it("maps a 404 on the parameter lookup to job not found", async () => {
      vi.mocked(common.httpGetJson).mockRejectedValue(new Error("HTTP 404"))
      vi.mocked(fetch).mockReturnValue(
        mockFetchResponse({ crumbRequestField: "Jenkins-Crumb", crumb: "c" }),
      )

      await expect(client.triggerBuild("acme/missing")).rejects.toThrow(
        "Job not found: acme/missing",
      )
      expect(common.httpPost).not.toHaveBeenCalled()
    })
  })

  describe("per-build 404s", () => {
    // The block below needs exact call sequences, and mock implementations
    // (including queued once-return values) survive clearAllMocks, so leaked
    // 404s from a previous test corrupt the next one. Reset the three HTTP
    // mocks entering and leaving this block; every test here sets its own.
    const resetHttpMocks = () => {
      vi.mocked(common.httpGetJson).mockReset()
      vi.mocked(common.httpGetText).mockReset()
      vi.mocked(common.httpGetTextWithHeaders).mockReset()
      vi.mocked(common.httpPost).mockReset()
    }
    beforeEach(resetHttpMocks)
    afterEach(resetHttpMocks)

    // A 404 on a build URL maps to the thing actually missing: the job probe
    // (second httpGetJson) decides between "job gone" and "build gone".
    it("getBuild reports build not found when the job exists", async () => {
      vi.mocked(common.httpGetJson)
        .mockRejectedValueOnce(new Error("HTTP 404")) // build record
        .mockResolvedValueOnce({ name: "my-job" }) // job probe
      await expect(client.getBuild("my-job", 99)).rejects.toThrow(
        "Build 99 not found for job my-job",
      )
    })

    it("getBuild still reports job not found when the job is gone too", async () => {
      vi.mocked(common.httpGetJson).mockRejectedValue(new Error("HTTP 404"))
      await expect(client.getBuild("gone", 1)).rejects.toThrow(
        "Job not found: gone",
      )
    })

    it("getConsoleLog reports a missing build", async () => {
      vi.mocked(common.httpGetText).mockRejectedValueOnce(
        new Error("HTTP 404"),
      )
      vi.mocked(common.httpGetJson).mockResolvedValueOnce({ name: "my-job" })
      await expect(client.getConsoleLog("my-job", 12)).rejects.toThrow(
        "Build 12 not found for job my-job",
      )
    })

    it("listArtifacts reports a missing build", async () => {
      vi.mocked(common.httpGetJson)
        .mockRejectedValueOnce(new Error("HTTP 404"))
        .mockResolvedValueOnce({ name: "my-job" })
      await expect(client.listArtifacts("my-job", 44)).rejects.toThrow(
        "Build 44 not found for job my-job",
      )
    })

    it("stopBuild reports a missing build", async () => {
      vi.mocked(common.httpPost).mockResolvedValue({ status: 404, headers: {} })
      vi.mocked(common.httpGetJson).mockResolvedValueOnce({ name: "my-job" })
      await expect(client.stopBuild("my-job", 77)).rejects.toThrow(
        "Build 77 not found for job my-job",
      )
    })

    // Artifact and sub-resource URLs can 404 with the build still there; the
    // existing per-target behaviour must survive that case.
    it("getArtifact keeps artifact not found when the build exists", async () => {
      vi.mocked(common.httpGetText).mockRejectedValueOnce(
        new Error("HTTP 404"),
      )
      vi.mocked(common.httpGetJson).mockResolvedValueOnce({ number: 5 })
      await expect(
        client.getArtifact("my-job", 5, "build/app.jar"),
      ).rejects.toThrow("Artifact not found: build/app.jar")
    })

    it("getArtifact reports build not found when the build is gone", async () => {
      vi.mocked(common.httpGetText).mockRejectedValueOnce(
        new Error("HTTP 404"),
      )
      vi.mocked(common.httpGetJson)
        .mockRejectedValueOnce(new Error("HTTP 404")) // build probe
        .mockResolvedValueOnce({ name: "my-job" }) // job probe
      await expect(
        client.getArtifact("my-job", 5, "build/app.jar"),
      ).rejects.toThrow("Build 5 not found for job my-job")
    })

    it("getTestResults throws build not found when the build is gone", async () => {
      vi.mocked(common.httpGetJson)
        .mockRejectedValueOnce(new Error("HTTP 404")) // testReport
        .mockRejectedValueOnce(new Error("HTTP 404")) // build probe
        .mockResolvedValueOnce({ name: "my-job" }) // job probe
      await expect(client.getTestResults("my-job", 10)).rejects.toThrow(
        "Build 10 not found for job my-job",
      )
    })

    it("getPipelineStages keeps the graceful shape when the build exists", async () => {
      vi.mocked(common.httpGetJson)
        .mockRejectedValueOnce(new Error("HTTP 404")) // wfapi
        .mockResolvedValueOnce({ number: 10 }) // build probe
      await expect(client.getPipelineStages("my-job", 10)).resolves.toEqual({
        jobName: "my-job",
        buildNumber: 10,
        message: "Not a pipeline build or workflow API not available",
      })
    })
  })

  describe("listArtifacts", () => {
    it("should list build artifacts", async () => {
      const mockResponse = {
        artifacts: [
          { fileName: "app.jar", relativePath: "build/app.jar" },
          {
            fileName: "test-results.xml",
            relativePath: "build/test-results.xml",
          },
        ],
      }
      vi.mocked(common.httpGetJson).mockResolvedValue(mockResponse)

      const artifacts = await client.listArtifacts("my-job", 100)

      expect(artifacts).toHaveLength(2)
      expect(artifacts[0]).toMatchObject({
        fileName: "app.jar",
        relativePath: "build/app.jar",
        url: expect.stringContaining("artifact/build/app.jar"),
      })
    })

    it("should return empty array when no artifacts", async () => {
      vi.mocked(common.httpGetJson).mockResolvedValue({ artifacts: null })

      const artifacts = await client.listArtifacts("my-job", 100)

      expect(artifacts).toEqual([])
    })
  })

  describe("searchJobs", () => {
    it("should filter jobs by query", async () => {
      const mockResponse = {
        jobs: [
          { name: "frontend-build", url: "url1" },
          { name: "backend-build", url: "url2" },
          { name: "frontend-test", url: "url3" },
        ],
      }
      vi.mocked(common.httpGetJson).mockResolvedValue(mockResponse)

      const results = await client.searchJobs("frontend")

      expect(results).toHaveLength(2)
      expect(results.map((j) => j.name)).toEqual([
        "frontend-build",
        "frontend-test",
      ])
    })

    it("should return empty array for empty query", async () => {
      const results = await client.searchJobs("   ")

      expect(results).toEqual([])
    })

    it("should search nested jobs by their full names", async () => {
      vi.mocked(common.httpGetJson)
        .mockResolvedValueOnce({
          jobs: [
            {
              name: "Sandbox",
              url: "https://jenkins.example.com/job/Sandbox/",
              _class: "com.cloudbees.hudson.plugins.folder.Folder",
              jobs: [{ name: "acceptance-logging-sandbox" }],
            },
          ],
        })
        .mockResolvedValueOnce({
          jobs: [
            {
              name: "acceptance-logging-sandbox",
              url: "https://jenkins.example.com/job/Sandbox/job/acceptance-logging-sandbox/",
              _class: "org.jenkinsci.plugins.workflow.job.WorkflowJob",
            },
          ],
        })

      const results = await client.searchJobs("acceptance-logging", {
        recursive: true,
      })

      expect(results).toEqual([
        {
          name: "Sandbox/acceptance-logging-sandbox",
          url: "https://jenkins.example.com/job/Sandbox/job/acceptance-logging-sandbox/",
        },
      ])
    })
  })

  describe("stopBuild", () => {
    it("should stop a running build", async () => {
      const mockCrumb = { crumbRequestField: "Jenkins-Crumb", crumb: "stop123" }
      vi.mocked(fetch).mockReturnValue(mockFetchResponse(mockCrumb))
      vi.mocked(common.httpPost).mockResolvedValue({ headers: {} })

      const result = await client.stopBuild("my-job", 50)

      expect(result).toEqual({
        jobName: "my-job",
        buildNumber: 50,
        stopped: true,
      })
      expect(common.httpPost).toHaveBeenCalledWith(
        "https://jenkins.example.com/job/my-job/50/stop",
        expect.anything(),
      )
    })
  })

  describe("getTestResults", () => {
    it("should return test results", async () => {
      const mockResponse = {
        totalCount: 100,
        passCount: 95,
        failCount: 3,
        skipCount: 2,
        duration: 45.5,
        suites: [{ name: "Suite1" }],
      }
      vi.mocked(common.httpGetJson).mockResolvedValue(mockResponse)

      const result = await client.getTestResults("my-job", 10)

      expect(result.totalTests).toBe(100)
      expect(result.passedTests).toBe(95)
      expect(result.failedTests).toBe(3)
      expect(result.skippedTests).toBe(2)
    })

    it("should handle missing test results", async () => {
      // Build 404s on the test report, then the probe confirms the build
      // exists, so a missing report stays a graceful empty result.
      vi.mocked(common.httpGetJson)
        .mockRejectedValueOnce(new Error("HTTP 404"))
        .mockResolvedValueOnce({ number: 10 })

      const result = await client.getTestResults("my-job", 10)

      expect(result.message).toContain("No test results found")
      expect(result.totalTests).toBe(0)
    })
  })

  describe("getQueue", () => {
    it("should return build queue", async () => {
      const mockResponse = {
        items: [
          {
            id: 123,
            blocked: false,
            buildable: true,
            stuck: false,
            why: "Waiting for executor",
            task: { name: "my-job", url: "url1" },
            inQueueSince: 1698768000000,
          },
        ],
      }
      vi.mocked(common.httpGetJson).mockResolvedValue(mockResponse)

      const queue = await client.getQueue()

      expect(queue).toHaveLength(1)
      expect(queue[0].id).toBe(123)
      expect(queue[0].why).toBe("Waiting for executor")
    })
  })

  describe("getSystemInfo", () => {
    it("should return Jenkins system info", async () => {
      const mockResponse = {
        nodeDescription: "Jenkins Controller",
        nodeName: "master",
        numExecutors: 4,
        mode: "NORMAL",
        quietingDown: false,
        useCrumbs: true,
        useSecurity: true,
      }
      vi.mocked(common.httpGetJson).mockResolvedValue(mockResponse)

      const info = await client.getSystemInfo()

      expect(info.nodeDescription).toBe("Jenkins Controller")
      expect(info.numExecutors).toBe(4)
      expect(info.useSecurity).toBe(true)
    })
  })

  describe("createJob", () => {
    it("should create a job with XML config", async () => {
      const mockCrumb = { crumbRequestField: "Jenkins-Crumb", crumb: "crumb1" }
      vi.mocked(fetch).mockReturnValue(mockFetchResponse(mockCrumb))
      vi.mocked(common.httpPost).mockResolvedValue({ status: 200, headers: {} })

      const result = await client.createJob("new-job", "<project/>")

      expect(result).toEqual({ jobName: "new-job", created: true })
      expect(common.httpPost).toHaveBeenCalledWith(
        "https://jenkins.example.com/createItem?name=new-job",
        expect.objectContaining({
          headers: expect.objectContaining({
            "Content-Type": "application/xml",
          }),
          body: "<project/>",
        }),
      )
    })

    it("should create a job inside a nested folder", async () => {
      const mockCrumb = { crumbRequestField: "Jenkins-Crumb", crumb: "crumb1" }
      vi.mocked(fetch).mockReturnValue(mockFetchResponse(mockCrumb))
      vi.mocked(common.httpPost).mockResolvedValue({ status: 200, headers: {} })

      const result = await client.createJob(
        "DEV-EKS/Team A/demo-pipeline",
        "<flow-definition/>",
      )

      expect(result).toEqual({
        jobName: "DEV-EKS/Team A/demo-pipeline",
        created: true,
      })
      expect(common.httpPost).toHaveBeenCalledWith(
        "https://jenkins.example.com/job/DEV-EKS/job/Team%20A/createItem?name=demo-pipeline",
        expect.objectContaining({ body: "<flow-definition/>" }),
      )
    })

    it("should throw on HTTP 4xx response", async () => {
      const mockCrumb = { crumbRequestField: "Jenkins-Crumb", crumb: "crumb1" }
      vi.mocked(fetch).mockReturnValue(mockFetchResponse(mockCrumb))
      vi.mocked(common.httpPost).mockResolvedValue({ status: 400, headers: {} })

      await expect(client.createJob("bad-job", "<bad/>")).rejects.toThrow(
        "Create job failed",
      )
    })
  })

  describe("updateJobConfig", () => {
    it("should update job config", async () => {
      const mockCrumb = { crumbRequestField: "Jenkins-Crumb", crumb: "crumb2" }
      vi.mocked(fetch).mockReturnValue(mockFetchResponse(mockCrumb))
      vi.mocked(common.httpPost).mockResolvedValue({ status: 200, headers: {} })

      const result = await client.updateJobConfig("my-job", "<project/>")

      expect(result).toEqual({ jobName: "my-job", updated: true })
      expect(common.httpPost).toHaveBeenCalledWith(
        "https://jenkins.example.com/job/my-job/config.xml",
        expect.objectContaining({ body: "<project/>" }),
      )
    })
  })

  describe("renameJob", () => {
    it("should rename a job", async () => {
      const mockCrumb = { crumbRequestField: "Jenkins-Crumb", crumb: "crumb3" }
      vi.mocked(fetch).mockReturnValue(mockFetchResponse(mockCrumb))
      vi.mocked(common.httpPost).mockResolvedValue({ status: 200, headers: {} })

      const result = await client.renameJob("old-name", "new-name")

      expect(result).toEqual({
        oldName: "old-name",
        newName: "new-name",
        renamed: true,
      })
      expect(common.httpPost).toHaveBeenCalledWith(
        "https://jenkins.example.com/job/old-name/rename?newName=new-name",
        expect.anything(),
      )
    })
  })

  describe("copyJob", () => {
    it("should copy a job", async () => {
      const mockCrumb = { crumbRequestField: "Jenkins-Crumb", crumb: "crumb4" }
      vi.mocked(fetch).mockReturnValue(mockFetchResponse(mockCrumb))
      vi.mocked(common.httpPost).mockResolvedValue({ status: 200, headers: {} })

      const result = await client.copyJob("source-job", "copy-job")

      expect(result).toEqual({
        fromName: "source-job",
        newName: "copy-job",
        copied: true,
      })
      expect(common.httpPost).toHaveBeenCalledWith(
        "https://jenkins.example.com/createItem?name=copy-job&from=%2Fsource-job&mode=copy",
        expect.anything(),
      )
    })

    it("should copy a nested source job into a nested destination folder", async () => {
      const mockCrumb = { crumbRequestField: "Jenkins-Crumb", crumb: "crumb4" }
      vi.mocked(fetch).mockReturnValue(mockFetchResponse(mockCrumb))
      vi.mocked(common.httpPost).mockResolvedValue({ status: 200, headers: {} })

      const result = await client.copyJob(
        "DEV-EKS/templates/source-pipeline",
        "Sandbox/Team A/copied-pipeline",
      )

      expect(result).toEqual({
        fromName: "DEV-EKS/templates/source-pipeline",
        newName: "Sandbox/Team A/copied-pipeline",
        copied: true,
      })
      expect(common.httpPost).toHaveBeenCalledWith(
        "https://jenkins.example.com/job/Sandbox/job/Team%20A/createItem?name=copied-pipeline&from=%2FDEV-EKS%2Ftemplates%2Fsource-pipeline&mode=copy",
        expect.anything(),
      )
    })
  })

  describe("getNode", () => {
    it("should return node details", async () => {
      const mockResponse = {
        displayName: "agent-1",
        offline: false,
        temporarilyOffline: false,
        offlineCauseReason: "",
        idle: true,
        numExecutors: 2,
        assignedLabels: [{ name: "linux" }],
        monitorData: {},
      }
      vi.mocked(common.httpGetJson).mockResolvedValue(mockResponse)

      const result = await client.getNode("agent-1")

      expect(result.name).toBe("agent-1")
      expect(result.offline).toBe(false)
      expect(result.assignedLabels).toEqual(["linux"])
    })

    it("should throw on 404", async () => {
      vi.mocked(common.httpGetJson).mockRejectedValue(new Error("HTTP 404"))

      await expect(client.getNode("missing-node")).rejects.toThrow(
        "Node not found",
      )
    })
  })

  describe("toggleNodeOffline", () => {
    it("should toggle node offline", async () => {
      const mockCrumb = { crumbRequestField: "Jenkins-Crumb", crumb: "crumb5" }
      vi.mocked(fetch).mockReturnValue(mockFetchResponse(mockCrumb))
      vi.mocked(common.httpPost).mockResolvedValue({ status: 200, headers: {} })

      const result = await client.toggleNodeOffline("agent-1", "maintenance")

      expect(result).toEqual({ nodeName: "agent-1", toggledOffline: true })
      expect(common.httpPost).toHaveBeenCalledWith(
        expect.stringContaining("agent-1/toggleOffline"),
        expect.anything(),
      )
    })
  })

  describe("listViews", () => {
    it("should return all views with jobs", async () => {
      const mockResponse = {
        views: [
          {
            name: "All",
            url: "http://jenkins/view/All/",
            jobs: [{ name: "job-1", url: "url1" }],
          },
          { name: "My View", url: "http://jenkins/view/My/", jobs: [] },
        ],
      }
      vi.mocked(common.httpGetJson).mockResolvedValue(mockResponse)

      const views = await client.listViews()

      expect(views).toHaveLength(2)
      expect(views[0].name).toBe("All")
      expect(views[0].jobs).toHaveLength(1)
    })

    it("should return empty array when no views", async () => {
      vi.mocked(common.httpGetJson).mockResolvedValue({ views: null })

      const views = await client.listViews()

      expect(views).toEqual([])
    })
  })

  describe("getView", () => {
    it("should return view details", async () => {
      const mockResponse = {
        name: "My View",
        url: "http://jenkins/view/My/",
        description: "My custom view",
        jobs: [{ name: "job-1", url: "url1", color: "blue" }],
      }
      vi.mocked(common.httpGetJson).mockResolvedValue(mockResponse)

      const view = await client.getView("My View")

      expect(view.name).toBe("My View")
      expect(view.jobs).toHaveLength(1)
      expect(view.jobs[0].color).toBe("blue")
    })

    it("should throw on 404", async () => {
      vi.mocked(common.httpGetJson).mockRejectedValue(new Error("HTTP 404"))

      await expect(client.getView("missing-view")).rejects.toThrow(
        "View not found",
      )
    })
  })

  describe("quietDown", () => {
    it("should enable quiet mode", async () => {
      const mockCrumb = { crumbRequestField: "Jenkins-Crumb", crumb: "crumb6" }
      vi.mocked(fetch).mockReturnValue(mockFetchResponse(mockCrumb))
      vi.mocked(common.httpPost).mockResolvedValue({ status: 200, headers: {} })

      const result = await client.quietDown("scheduled maintenance")

      expect(result).toEqual({ quietingDown: true })
      expect(common.httpPost).toHaveBeenCalledWith(
        expect.stringContaining("quietDown"),
        expect.anything(),
      )
    })
  })

  describe("cancelQuietDown", () => {
    it("should cancel quiet mode", async () => {
      const mockCrumb = { crumbRequestField: "Jenkins-Crumb", crumb: "crumb7" }
      vi.mocked(fetch).mockReturnValue(mockFetchResponse(mockCrumb))
      vi.mocked(common.httpPost).mockResolvedValue({ status: 200, headers: {} })

      const result = await client.cancelQuietDown()

      expect(result).toEqual({ quietingDown: false })
      expect(common.httpPost).toHaveBeenCalledWith(
        "https://jenkins.example.com/cancelQuietDown",
        expect.anything(),
      )
    })
  })

  describe("safeRestart", () => {
    it("should initiate safe restart", async () => {
      const mockCrumb = { crumbRequestField: "Jenkins-Crumb", crumb: "crumb8" }
      vi.mocked(fetch).mockReturnValue(mockFetchResponse(mockCrumb))
      vi.mocked(common.httpPost).mockResolvedValue({ status: 200, headers: {} })

      const result = await client.safeRestart()

      expect(result).toEqual({ restarting: true })
      expect(common.httpPost).toHaveBeenCalledWith(
        "https://jenkins.example.com/safeRestart",
        expect.anything(),
      )
    })
  })

  describe("replayBuild", () => {
    it("should replay a build with no body when mainScript is omitted", async () => {
      const mockCrumb = {
        crumbRequestField: "Jenkins-Crumb",
        crumb: "replay123",
      }
      vi.mocked(fetch).mockReturnValue(mockFetchResponse(mockCrumb))
      vi.mocked(common.httpPost).mockResolvedValue({
        status: 201,
        headers: { location: "https://jenkins.example.com/queue/item/77/" },
      })

      const result = await client.replayBuild("my-pipeline", 5)

      expect(result).toEqual({
        jobName: "my-pipeline",
        buildNumber: 5,
        queueUrl: "https://jenkins.example.com/queue/item/77/",
      })
      expect(common.httpPost).toHaveBeenCalledWith(
        "https://jenkins.example.com/job/my-pipeline/5/replay/rebuild",
        expect.not.objectContaining({ body: expect.anything() }),
      )
      // Content-Type must NOT be set when there is no body
      const callArgs = vi.mocked(common.httpPost).mock.calls[0][1] as any
      expect(callArgs.headers?.["Content-Type"]).toBeUndefined()
    })

    it("should replay a build with form-encoded body when mainScript is provided", async () => {
      const mockCrumb = {
        crumbRequestField: "Jenkins-Crumb",
        crumb: "replay456",
      }
      vi.mocked(fetch).mockReturnValue(mockFetchResponse(mockCrumb))
      vi.mocked(common.httpPost).mockResolvedValue({
        status: 201,
        headers: { location: "https://jenkins.example.com/queue/item/88/" },
      })

      const script =
        'pipeline { agent any; stages { stage("S") { steps { echo "ok" } } } }'
      const result = await client.replayBuild("my-pipeline", 10, script)

      expect(result).toEqual({
        jobName: "my-pipeline",
        buildNumber: 10,
        queueUrl: "https://jenkins.example.com/queue/item/88/",
      })
      expect(common.httpPost).toHaveBeenCalledWith(
        "https://jenkins.example.com/job/my-pipeline/10/replay/rebuild",
        expect.objectContaining({
          headers: expect.objectContaining({
            "Content-Type": "application/x-www-form-urlencoded",
          }),
          body: expect.stringContaining("mainScript="),
        }),
      )
      // Verify the body encodes the script correctly
      const callArgs = vi.mocked(common.httpPost).mock.calls[0][1] as any
      const params = new URLSearchParams(callArgs.body)
      expect(params.get("mainScript")).toBe(script)
    })

    it("rejects a 2xx response with no queue Location header", async () => {
      const mockCrumb = {
        crumbRequestField: "Jenkins-Crumb",
        crumb: "replaynoloc",
      }
      vi.mocked(fetch).mockReturnValue(mockFetchResponse(mockCrumb))
      vi.mocked(common.httpPost).mockResolvedValue({ status: 201, headers: {} })

      await expect(client.replayBuild("my-pipeline", 3)).rejects.toThrow(
        "Replay returned HTTP 201 without a queue Location header for https://jenkins.example.com/job/my-pipeline/3/replay/rebuild",
      )
    })

    it("rejects a redirect response instead of following it", async () => {
      const mockCrumb = {
        crumbRequestField: "Jenkins-Crumb",
        crumb: "replayredirect",
      }
      vi.mocked(fetch).mockReturnValue(mockFetchResponse(mockCrumb))
      vi.mocked(common.httpPost).mockResolvedValue({
        status: 302,
        headers: { location: "https://jenkins.example.com/login" },
      })

      await expect(client.replayBuild("my-pipeline", 3)).rejects.toThrow(
        "Replay failed: HTTP 302 for https://jenkins.example.com/job/my-pipeline/3/replay/rebuild, redirects to https://jenkins.example.com/login, not followed",
      )
    })

    // fetch follows redirects by default, which turned an authentication
    // bounce into a 200 HTML page that read as a queued build.
    it("sends the replay POST asking not to follow redirects", async () => {
      const mockCrumb = {
        crumbRequestField: "Jenkins-Crumb",
        crumb: "replaymanual",
      }
      vi.mocked(fetch).mockReturnValue(mockFetchResponse(mockCrumb))
      vi.mocked(common.httpPost).mockResolvedValue({
        status: 201,
        headers: { location: "https://jenkins.example.com/queue/item/90/" },
      })

      await client.replayBuild("my-pipeline", 3)

      const call = vi.mocked(common.httpPost).mock.calls[0][1] as any
      expect(call.redirect).toBe("manual")
    })

    it("reports build not found on 404 when the job still exists", async () => {
      const mockCrumb = {
        crumbRequestField: "Jenkins-Crumb",
        crumb: "replay404",
      }
      vi.mocked(fetch).mockReturnValue(mockFetchResponse(mockCrumb))
      vi.mocked(common.httpPost).mockResolvedValue({ status: 404, headers: {} })
      vi.mocked(common.httpGetJson).mockResolvedValue({
        name: "missing-pipeline",
      })

      await expect(client.replayBuild("missing-pipeline", 1)).rejects.toThrow(
        "Build 1 not found for job missing-pipeline",
      )
    })

    it("reports job not found on 404 when the job is gone too", async () => {
      const mockCrumb = {
        crumbRequestField: "Jenkins-Crumb",
        crumb: "replay404job",
      }
      vi.mocked(fetch).mockReturnValue(mockFetchResponse(mockCrumb))
      vi.mocked(common.httpPost).mockResolvedValue({ status: 404, headers: {} })
      vi.mocked(common.httpGetJson).mockRejectedValue(new Error("HTTP 404"))

      await expect(client.replayBuild("missing-pipeline", 1)).rejects.toThrow(
        "Job not found: missing-pipeline",
      )
    })
  })
})

describe("JenkinsClient — request deadline (issue #18)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal("fetch", vi.fn())
  })
  afterEach(() => vi.unstubAllGlobals())

  // Pins the contract after the deadline default moved from 10 s to 30 s: a
  // caller that constructs the client the old way now gets 30 s, and one that
  // still wants 10 s has to pass it explicitly.
  it("uses the 30 s default when credentials omit timeoutMs", () => {
    const client = new JenkinsClient({ baseUrl: "https://jenkins.example.com" })
    expect(client.timeoutMs).toBe(30000)
  })

  it("keeps the old 10 s deadline for callers who pass it explicitly", () => {
    const client = new JenkinsClient({
      baseUrl: "https://jenkins.example.com",
      timeoutMs: 10000,
    })
    expect(client.timeoutMs).toBe(10000)
  })

  it("takes the deadline from credentials when given", () => {
    const client = new JenkinsClient({
      baseUrl: "https://jenkins.example.com",
      timeoutMs: 60000,
    })
    expect(client.timeoutMs).toBe(60000)
  })

  it("takes the deadline from the environment when constructed bare", () => {
    vi.mocked(common.loadJenkinsEnv).mockReturnValueOnce({
      JENKINS_URL: "https://jenkins.example.com",
      JENKINS_USER: "u",
      JENKINS_API_TOKEN: "t",
      JENKINS_TIMEOUT_MS: 45000,
    } as never)
    expect(new JenkinsClient().timeoutMs).toBe(45000)
  })

  it("sends the configured deadline on the request, not the transport default", async () => {
    const client = new JenkinsClient({
      baseUrl: "https://jenkins.example.com",
      timeoutMs: 60000,
    })
    vi.mocked(common.httpGetJson).mockResolvedValue({ builds: [] })
    await client.getRecentBuilds("test-job", 5)
    expect(common.httpGetJson).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ timeoutMs: 60000 }),
    )
  })
})

describe("JenkinsClient — query shape (issue #18)", () => {
  let client: JenkinsClient

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal("fetch", vi.fn())
    client = new JenkinsClient()
  })
  afterEach(() => vi.unstubAllGlobals())

  const urlOf = () => vi.mocked(common.httpGetJson).mock.calls[0][0] as string

  it("asks Jenkins for a slice of builds rather than expanding every one", async () => {
    vi.mocked(common.httpGetJson).mockResolvedValue({ builds: [] })
    await client.getRecentBuilds("test-job", 3)
    expect(urlOf()).not.toContain("depth=1")
    expect(new URL(urlOf()).searchParams.get("tree")).toBe(
      "builds[number,result,duration,timestamp,url,building]{0,3}",
    )
  })

  it("names only the fields it reads on a single build", async () => {
    vi.mocked(common.httpGetJson).mockResolvedValue({ number: 55 })
    await client.getBuild("my-job", 55)
    expect(new URL(urlOf()).searchParams.get("tree")).toBe(
      "number,result,duration,timestamp,url,building",
    )
  })

  it("names only the fields it reads on the last build", async () => {
    vi.mocked(common.httpGetJson).mockResolvedValue({ number: 55 })
    await client.getLastBuild("my-job")
    expect(new URL(urlOf()).searchParams.get("tree")).toBe(
      "number,result,duration,timestamp,url,building",
    )
  })

  it.each([0, -1, 1.5])("rejects a limit of %s", async (limit) => {
    await expect(client.getRecentBuilds("test-job", limit)).rejects.toThrow(
      /positive whole number/,
    )
    expect(common.httpGetJson).not.toHaveBeenCalled()
  })
})

describe("JenkinsClient — tree 查询编码", () => {
  const cases: {
    name: string
    request: (client: JenkinsClient) => Promise<unknown>
    path: string
    tree: string
  }[] = [
    {
      name: "任务列表",
      request: (client) => client.listJobs(),
      path: "/api/json",
      tree: "jobs[name,url,_class,jobs[name]]",
    },
    {
      name: "嵌套文件夹任务列表",
      request: (client) => client.listJobs({ folder: "Team/Service A" }),
      path: "/job/Team/job/Service%20A/api/json",
      tree: "jobs[name,url,_class,jobs[name]]",
    },
    {
      name: "任务搜索",
      request: (client) => client.searchJobs("test"),
      path: "/api/json",
      tree: "jobs[name,url,_class,jobs[name]]",
    },
    {
      name: "视图列表",
      request: (client) => client.listViews(),
      path: "/api/json",
      tree: "views[name,url,jobs[name,url]]",
    },
    {
      name: "最近构建及范围",
      request: (client) => client.getRecentBuilds("my-job", 3),
      path: "/job/my-job/api/json",
      tree: "builds[number,result,duration,timestamp,url,building]{0,3}",
    },
    {
      name: "指定构建",
      request: (client) => client.getBuild("my-job", 55),
      path: "/job/my-job/55/api/json",
      tree: "number,result,duration,timestamp,url,building",
    },
    {
      name: "最后构建",
      request: (client) => client.getLastBuild("my-job"),
      path: "/job/my-job/lastBuild/api/json",
      tree: "number,result,duration,timestamp,url,building",
    },
    {
      name: "构建产物",
      request: (client) => client.listArtifacts("my-job", 55),
      path: "/job/my-job/55/api/json",
      tree: "artifacts[fileName,relativePath]",
    },
    {
      name: "参数定义",
      request: (client) => client.getJobParameters("my-job"),
      path: "/job/my-job/api/json",
      tree: "property[parameterDefinitions[name,type,description,defaultParameterValue[value],choices]]",
    },
    {
      name: "构建变更",
      request: (client) => client.getBuildChanges("my-job", 55),
      path: "/job/my-job/55/api/json",
      tree: "changeSet[items[author[fullName],msg,commitId,timestamp]]",
    },
  ]

  beforeEach(() => vi.clearAllMocks())

  it.each(cases)("$name 编码特殊字符并保留查询含义", async ({ request, path, tree }) => {
    const client = new JenkinsClient({
      baseUrl: "https://jenkins.example.com/jenkins",
    })
    vi.mocked(common.httpGetJson).mockResolvedValue({})

    await request(client)

    expect(common.httpGetJson).toHaveBeenCalledTimes(1)
    const requestUrl = vi.mocked(common.httpGetJson).mock.calls[0][0] as string
    const parsedUrl = new URL(requestUrl)
    expect(parsedUrl.pathname).toBe(`/jenkins${path}`)
    // 在原始请求中消除特殊字符，解码后仍须是完整的 Jenkins tree 表达式。
    expect(parsedUrl.search).not.toMatch(/[\[\]{},]/)
    expect(parsedUrl.searchParams.get("tree")).toBe(tree)
    expect([...parsedUrl.searchParams.keys()]).toEqual(["tree"])
  })
})

import { describe, it, expect, afterEach, vi } from "vitest"
import { installFakeJenkins, BASE_URL } from "../helpers/fake-jenkins.js"
import { createJenkinsClient } from "../../src/lib/client.js"
import { toolHandlers } from "../../src/tool-handlers.js"
import { statusOf, toMcpError } from "../../src/lib/errors.js"
import { McpError } from "../../src/common/index.js"

afterEach(() => vi.unstubAllGlobals())

const authOf = async (env: Parameters<typeof createJenkinsClient>[0]) => {
  const fake = installFakeJenkins()
  await toolHandlers.jenkins_get_system_info(createJenkinsClient(env), {})
  return fake.requests[0].headers.authorization
}

describe("createJenkinsClient", () => {
  const base = { JENKINS_URL: BASE_URL, JENKINS_TIMEOUT_MS: 30000 }

  it("sends Basic credentials from a user and API token", async () => {
    expect(await authOf({ ...base, JENKINS_USER: "u", JENKINS_API_TOKEN: "t" })).toBe(
      "Basic " + Buffer.from("u:t").toString("base64"),
    )
  })

  it("sends a bearer token, and prefers it over Basic credentials", async () => {
    expect(
      await authOf({ ...base, JENKINS_USER: "u", JENKINS_API_TOKEN: "t", JENKINS_BEARER_TOKEN: "abc" }),
    ).toBe("Bearer abc")
  })

  it("sends no Authorization header at all when anonymous", async () => {
    expect(await authOf({ ...base, JENKINS_ANONYMOUS: true, JENKINS_BEARER_TOKEN: "abc" })).toBeUndefined()
  })

  it("carries the configured deadline", () => {
    expect(createJenkinsClient({ ...base, JENKINS_TIMEOUT_MS: 45000 }).timeout).toBe(45000)
  })
})

describe("error mapping", () => {
  it("reads a status from the core's HttpError and from its plain write errors", () => {
    expect(statusOf(Object.assign(new Error("x"), { status: 404 }))).toBe(404)
    expect(statusOf(new Error("Stop failed: 404 Not Found"))).toBe(404)
    expect(statusOf(new Error("HTTP 503 Service Unavailable: busy"))).toBe(503)
    expect(statusOf(new Error("nothing here"))).toBeUndefined()
  })

  it("turns a 401 into AUTH_FAILED on every tool", async () => {
    const fake = installFakeJenkins()
    fake.fetch.mockImplementation(async () => new Response("no", { status: 401, statusText: "Unauthorized" }))
    const client = createJenkinsClient({ JENKINS_URL: BASE_URL, JENKINS_ANONYMOUS: true, JENKINS_TIMEOUT_MS: 30000 })
    for (const tool of ["jenkins_list_jobs", "jenkins_get_job_status", "jenkins_get_plugins"]) {
      await expect(toolHandlers[tool](client, { jobName: "app" })).rejects.toMatchObject({ code: "AUTH_FAILED" })
    }
  })

  it("turns an aborted request into TIMEOUT", async () => {
    const fake = installFakeJenkins()
    fake.fetch.mockImplementation(async () => {
      throw new DOMException("This operation was aborted", "AbortError")
    })
    const client = createJenkinsClient({ JENKINS_URL: BASE_URL, JENKINS_ANONYMOUS: true, JENKINS_TIMEOUT_MS: 30000 })
    await expect(toolHandlers.jenkins_get_plugins(client, {})).rejects.toMatchObject({ code: "TIMEOUT" })
  })

  it("passes McpErrors and unknown errors through", () => {
    const own = new McpError("X", "x")
    expect(toMcpError(own)).toBe(own)
    const other = new Error("boom")
    expect(toMcpError(other)).toBe(other)
  })
})

describe("writes", () => {
  it("carry the crumb and the session cookie it was issued with", async () => {
    const fake = installFakeJenkins()
    const client = createJenkinsClient({
      JENKINS_URL: BASE_URL,
      JENKINS_BEARER_TOKEN: "abc",
      JENKINS_TIMEOUT_MS: 30000,
    })
    await toolHandlers.jenkins_trigger_build(client, { jobName: "app" })
    const post = fake.requests.find((r) => r.method === "POST")!
    expect(post.headers["jenkins-crumb"]).toBe("c0ffee")
    expect(post.headers.cookie).toBe("JSESSIONID.x=sess1")
    expect(post.headers.authorization).toBe("Bearer abc")
  })
})

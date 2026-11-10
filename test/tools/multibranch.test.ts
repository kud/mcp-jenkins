// A multibranch branch whose name holds a slash is one path segment in
// Jenkins ("job/repo/job/feature%2Fx"), not two folders. The old client split
// every slash into "/job/", so "repo/feature/x" 404ed on every tool.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
  installFakeJenkins,
  type FakeJenkins,
} from "../helpers/fake-jenkins.js"
import { makeClient } from "../helpers/client.js"
import { toolHandlers } from "../../src/tool-handlers.js"

const BRANCH = "repo/feature/x"
let fake: FakeJenkins
let client: ReturnType<typeof makeClient>

beforeEach(() => {
  fake = installFakeJenkins()
  client = makeClient()
})
afterEach(() => vi.unstubAllGlobals())

describe("a multibranch branch with a slash in its name", () => {
  it("resolves for build status, through the branch's real path", async () => {
    const build = await toolHandlers.jenkins_get_build_status(client, {
      jobName: BRANCH,
      buildNumber: 4,
    })
    expect(build).toMatchObject({ id: "4", result: "SUCCESS" })
    expect(fake.requests.at(-1)!.path).toBe(
      "/job/repo/job/feature%2Fx/4/api/json",
    )
  })

  it("resolves for the last build, recent builds and the console log", async () => {
    expect(
      await toolHandlers.jenkins_get_job_status(client, { jobName: BRANCH }),
    ).toMatchObject({ id: "4" })
    expect(
      await toolHandlers.jenkins_get_recent_builds(client, {
        jobName: BRANCH,
        limit: 1,
      }),
    ).toHaveLength(1)
    const log = await toolHandlers.jenkins_get_console_log(client, {
      jobName: BRANCH,
    })
    expect(log.text).toBe("branch log\n")
  })

  it("resolves for a trigger, posting to the branch", async () => {
    await toolHandlers.jenkins_trigger_build(client, { jobName: BRANCH })
    const post = fake.requests.find((r) => r.method === "POST")!
    expect(post.path).toBe("/job/repo/job/feature%2Fx/build")
  })

  it("walks the hierarchy once, then goes straight to the cached path", async () => {
    await toolHandlers.jenkins_get_build_status(client, {
      jobName: BRANCH,
      buildNumber: 4,
    })
    const before = fake.requests.length
    await toolHandlers.jenkins_get_build_status(client, {
      jobName: BRANCH,
      buildNumber: 4,
    })
    expect(fake.requests.length - before).toBe(1)
  })

  it("still reports a branch that does not exist as missing", async () => {
    await expect(
      toolHandlers.jenkins_get_build_status(client, {
        jobName: "repo/feature/nope",
        buildNumber: 1,
      }),
    ).rejects.toMatchObject({ code: "JOB_NOT_FOUND" })
  })
})

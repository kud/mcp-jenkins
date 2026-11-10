import { describe, it, expect, afterEach, vi } from "vitest"
import { installFakeJenkins, BASE_URL } from "../helpers/fake-jenkins.js"
import { makeClient } from "../helpers/client.js"
import { triggerBuild } from "../../src/lib/trigger.js"

afterEach(() => vi.unstubAllGlobals())

describe("triggerBuild", () => {
  it("POSTs to /build with the crumb for a job without parameters", async () => {
    const fake = installFakeJenkins()
    expect(await triggerBuild(makeClient(), "app")).toEqual({
      jobName: "app",
      queueUrl: `${BASE_URL}/queue/item/42/`,
    })
    const post = fake.requests.find((r) => r.method === "POST")!
    expect(new URL(post.url).pathname).toBe("/job/app/build")
    expect(post.headers["jenkins-crumb"]).toBe("c0ffee")
  })

  it("refuses params for a job that takes none, before posting", async () => {
    const fake = installFakeJenkins()
    await expect(triggerBuild(makeClient(), "app", { X: 1 })).rejects.toThrow(
      "Unknown parameters for job app: X. This job takes no parameters.",
    )
    expect(fake.requests.some((r) => r.method === "POST")).toBe(false)
  })

  it("refuses with PARAMETERS_REQUIRED when only some parameters are passed", async () => {
    const fake = installFakeJenkins()
    await expect(triggerBuild(makeClient(), "deploy", { ENV: "prod" })).rejects.toMatchObject({
      code: "PARAMETERS_REQUIRED",
      message: expect.stringContaining("DRY_RUN (BooleanParameterDefinition, default true)"),
    })
    expect(fake.requests.some((r) => r.method === "POST")).toBe(false)
  })

  it("posts a form body to buildWithParameters, stringifying values", async () => {
    const fake = installFakeJenkins()
    await triggerBuild(makeClient(), "deploy", { ENV: "prod", DRY_RUN: false })
    const post = fake.requests.find((r) => r.method === "POST")!
    expect(new URL(post.url).pathname).toBe("/job/deploy/buildWithParameters")
    expect(post.headers["content-type"]).toBe("application/x-www-form-urlencoded")
    expect(post.body).toBe("ENV=prod&DRY_RUN=false")
  })

  it("throws instead of returning a null queueUrl when Jenkins gives no Location", async () => {
    const fake = installFakeJenkins()
    const real = fake.fetch.getMockImplementation()!
    fake.fetch.mockImplementation(async (input: any, init: any) =>
      String(input).endsWith("/build") ? new Response("<html>login</html>", { status: 200 }) : real(input, init),
    )
    await expect(triggerBuild(makeClient(), "app")).rejects.toMatchObject({
      code: "UNEXPECTED",
      message: "Trigger build for app returned no queue Location header",
    })
  })

  it("reports a refused trigger with its status", async () => {
    const fake = installFakeJenkins()
    const real = fake.fetch.getMockImplementation()!
    fake.fetch.mockImplementation(async (input: any, init: any) =>
      String(input).endsWith("/build") ? new Response("no", { status: 403 }) : real(input, init),
    )
    await expect(triggerBuild(makeClient(), "app")).rejects.toMatchObject({
      code: "UNEXPECTED",
      message: "Trigger build failed: HTTP 403",
    })
  })
})

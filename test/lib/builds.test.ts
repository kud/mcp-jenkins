import { describe, it, expect, afterEach, vi } from "vitest"
import { installFakeJenkins } from "../helpers/fake-jenkins.js"
import { makeClient } from "../helpers/client.js"
import { createJenkinsClient } from "../../src/lib/client.js"
import { getBuild, getLastBuild, getRecentBuilds } from "../../src/lib/builds.js"
import { listJobs } from "../../src/lib/jobs.js"
import { getJobParameters } from "../../src/tools/get-job-parameters.js"
import { getBuildChanges } from "../../src/tools/get-build-changes.js"
import { listArtifacts } from "../../src/tools/list-artifacts.js"
import { listViews } from "../../src/tools/list-views.js"

afterEach(() => vi.unstubAllGlobals())

const treeOf = (url: string) => new URL(url).searchParams.get("tree")

describe("query shape (issue #18)", () => {
  it("asks Jenkins for a slice of builds rather than expanding every one", async () => {
    const fake = installFakeJenkins()
    await getRecentBuilds(makeClient(), "app", 3)
    expect(fake.requests).toHaveLength(1)
    expect(fake.requests[0].url).not.toContain("depth=1")
    expect(treeOf(fake.requests[0].url)).toBe(
      "builds[number,result,duration,timestamp,url,building]{0,3}",
    )
  })

  it("names only the fields it reads on a single build and the last build", async () => {
    const fake = installFakeJenkins()
    await getBuild(makeClient(), "app", 2)
    await getLastBuild(makeClient(), "app")
    expect(fake.requests.map((r) => [new URL(r.url).pathname, treeOf(r.url)])).toEqual([
      ["/job/app/2/api/json", "number,result,duration,timestamp,url,building"],
      ["/job/app/lastBuild/api/json", "number,result,duration,timestamp,url,building"],
    ])
  })

  it.each([0, -1, 1.5])("rejects a limit of %s before any request", async (limit) => {
    const fake = installFakeJenkins()
    await expect(getRecentBuilds(makeClient(), "app", limit)).rejects.toThrow(
      /positive whole number/,
    )
    expect(fake.requests).toHaveLength(0)
  })
})

describe("tree query encoding", () => {
  // Square brackets are not valid unencoded in a URL query, and some Jenkins
  // instances and reverse proxies answer a raw tree=jobs[name] with HTTP 400.
  const cases: {
    name: string
    request: (client: ReturnType<typeof makeClient>) => Promise<unknown>
    path: string
    tree: string
  }[] = [
    { name: "job list", request: (c) => listJobs(c), path: "/api/json", tree: "jobs[name,url,_class,jobs[name]]" },
    { name: "nested folder job list", request: (c) => listJobs(c, { folder: "Team/Service A" }), path: "/job/Team/job/Service%20A/api/json", tree: "jobs[name,url,_class,jobs[name]]" },
    { name: "view list", request: (c) => listViews(c, {}), path: "/api/json", tree: "views[name,url,jobs[name,url]]" },
    { name: "recent builds", request: (c) => getRecentBuilds(c, "my-job", 3), path: "/job/my-job/api/json", tree: "builds[number,result,duration,timestamp,url,building]{0,3}" },
    { name: "a given build", request: (c) => getBuild(c, "my-job", 55), path: "/job/my-job/55/api/json", tree: "number,result,duration,timestamp,url,building" },
    { name: "build artifacts", request: (c) => listArtifacts(c, { jobName: "my-job", buildNumber: 55 }), path: "/job/my-job/55/api/json", tree: "artifacts[fileName,relativePath]" },
    { name: "parameter definitions", request: (c) => getJobParameters(c, { jobName: "my-job" }), path: "/job/my-job/api/json", tree: "property[parameterDefinitions[name,type,description,defaultParameterValue[value],choices]]" },
    { name: "build changes", request: (c) => getBuildChanges(c, { jobName: "my-job", buildNumber: 55 }), path: "/job/my-job/55/api/json", tree: "changeSet[items[author[fullName],msg,commitId,timestamp]]" },
  ]

  it.each(cases)("$name encodes special characters and keeps the query intact", async ({ request, path, tree }) => {
    const fetch = vi.fn(async () => new Response("{}", { headers: { "content-type": "application/json" } }))
    vi.stubGlobal("fetch", fetch)
    const client = createJenkinsClient({
      JENKINS_URL: "https://jenkins.example.com/jenkins",
      JENKINS_ANONYMOUS: true,
      JENKINS_TIMEOUT_MS: 30000,
    })

    await request(client)

    expect(fetch).toHaveBeenCalledTimes(1)
    const parsed = new URL(String((fetch.mock.calls[0] as unknown[])[0]))
    expect(parsed.pathname).toBe(`/jenkins${path}`)
    expect(parsed.search).not.toMatch(/[\[\]{},]/)
    expect(parsed.searchParams.get("tree")).toBe(tree)
    expect([...parsed.searchParams.keys()]).toEqual(["tree"])
  })
})

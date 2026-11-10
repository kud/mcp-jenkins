import { describe, it, expect, afterEach, vi } from "vitest"
import { installFakeJenkins, type FakeJob } from "../helpers/fake-jenkins.js"
import { makeClient } from "../helpers/client.js"
import { listJobs, normalizeJobFullName, searchJobs } from "../../src/lib/jobs.js"

const FOLDER = "com.cloudbees.hudson.plugins.folder.Folder"
const WORKFLOW = "org.jenkinsci.plugins.workflow.job.WorkflowJob"

const tree: FakeJob[] = [
  { segments: ["Sandbox"], _class: FOLDER },
  { segments: ["Sandbox", "acceptance"], _class: WORKFLOW },
  { segments: ["Sandbox", "Team"], _class: FOLDER },
  { segments: ["Sandbox", "Team", "deep-job"], _class: WORKFLOW },
]

afterEach(() => vi.unstubAllGlobals())

describe("listJobs", () => {
  it("does not traverse nested folders unless recursion is requested", async () => {
    const fake = installFakeJenkins(tree)
    expect((await listJobs(makeClient())).map((j) => j.name)).toEqual(["Sandbox"])
    expect(fake.requests).toHaveLength(1)
  })

  it("lists nested folders recursively, by full name", async () => {
    installFakeJenkins(tree)
    expect((await listJobs(makeClient(), { recursive: true })).map((j) => j.name)).toEqual([
      "Sandbox",
      "Sandbox/acceptance",
      "Sandbox/Team",
      "Sandbox/Team/deep-job",
    ])
  })

  it("stops at maxDepth", async () => {
    installFakeJenkins(tree)
    expect(
      (await listJobs(makeClient(), { recursive: true, maxDepth: 1 })).map((j) => j.name),
    ).toEqual(["Sandbox", "Sandbox/acceptance", "Sandbox/Team"])
  })

  // NaN survives Math.floor/max/min and `depth < NaN` is always false, so an
  // unguarded non-numeric depth returns only the top level.
  it("falls back to the default depth when maxDepth is not a number", async () => {
    installFakeJenkins(tree)
    const jobs = await listJobs(makeClient(), { recursive: true, maxDepth: Number.NaN })
    expect(jobs.map((j) => j.name)).toContain("Sandbox/Team/deep-job")
  })

  it("lists a selected folder and omits folder entries when asked", async () => {
    installFakeJenkins(tree)
    const jobs = await listJobs(makeClient(), {
      folder: "/Sandbox/",
      recursive: true,
      includeFolders: false,
    })
    expect(jobs.map((j) => j.name)).toEqual(["Sandbox/acceptance", "Sandbox/Team/deep-job"])
  })

  it("does not descend into a multibranch project that lists no children", async () => {
    const fake = installFakeJenkins([
      { segments: ["svc"], _class: "org.jenkinsci.plugins.workflow.multibranch.WorkflowMultiBranchProject" },
    ])
    // The fake lists children for non-workflow items; strip them as Jenkins
    // does when a tree omits them.
    fake.fetch.mockImplementationOnce(async () =>
      new Response(
        JSON.stringify({ jobs: [{ name: "svc", url: "https://jenkins.example.com/job/svc/", _class: "org.jenkinsci.plugins.workflow.multibranch.WorkflowMultiBranchProject" }] }),
        { headers: { "content-type": "application/json" } },
      ),
    )
    expect((await listJobs(makeClient(), { recursive: true })).map((j) => j.name)).toEqual(["svc"])
    expect(fake.fetch).toHaveBeenCalledTimes(1)
  })

  it("returns an empty list for an empty instance", async () => {
    installFakeJenkins([])
    expect(await listJobs(makeClient())).toEqual([])
  })

  it("names a missing folder", async () => {
    installFakeJenkins(tree)
    await expect(listJobs(makeClient(), { folder: "Nope" })).rejects.toThrow("Job not found: Nope")
  })
})

describe("searchJobs", () => {
  it("matches nested jobs by full name, case-insensitively", async () => {
    installFakeJenkins(tree)
    const jobs = await searchJobs(makeClient(), "team/DEEP", { recursive: true })
    expect(jobs.map((j) => j.name)).toEqual(["Sandbox/Team/deep-job"])
  })

  it("returns nothing for a blank query without asking Jenkins", async () => {
    const fake = installFakeJenkins(tree)
    expect(await searchJobs(makeClient(), "   ")).toEqual([])
    expect(fake.requests).toHaveLength(0)
  })
})

describe("normalizeJobFullName", () => {
  it("trims outer slashes", () => {
    expect(normalizeJobFullName(" /Team/svc/ ")).toBe("Team/svc")
  })

  it.each(["", "/", "Team//svc"])("rejects %j", (name) => {
    expect(() => normalizeJobFullName(name)).toThrow(/empty path segments/)
  })
})

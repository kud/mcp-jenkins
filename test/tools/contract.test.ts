// Every tool's output contract, end to end over a fake Jenkins. These pin
// what each tool returns, and which error it raises, independently of how the
// client underneath builds its requests.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
  installFakeJenkins,
  type FakeJenkins,
} from "../helpers/fake-jenkins.js"
import { makeClient } from "../helpers/client.js"
import { toolHandlers } from "../../src/tool-handlers.js"

type Client = ReturnType<typeof makeClient>
let fake: FakeJenkins
let client: Client

const call = (tool: string, input: Record<string, unknown> = {}) =>
  toolHandlers[tool](client as never, input)

const failure = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e: any) {
    return { code: e.code, message: e.message }
  }
  throw new Error("expected the call to fail")
}

beforeEach(() => {
  fake = installFakeJenkins()
  client = makeClient()
})
afterEach(() => vi.unstubAllGlobals())

describe("jobs", () => {
  it("jenkins_list_jobs lists the top level", async () => {
    expect(await call("jenkins_list_jobs")).toMatchInlineSnapshot(`
      [
        {
          "name": "app",
          "url": "https://jenkins.example.com/job/app/",
        },
        {
          "name": "deploy",
          "url": "https://jenkins.example.com/job/deploy/",
        },
        {
          "name": "empty",
          "url": "https://jenkins.example.com/job/empty/",
        },
        {
          "name": "Team",
          "url": "https://jenkins.example.com/job/Team/",
        },
        {
          "name": "repo",
          "url": "https://jenkins.example.com/job/repo/",
        },
      ]
    `)
  })

  it("jenkins_list_jobs lists a folder", async () => {
    expect(
      await call("jenkins_list_jobs", { folder: "Team" }),
    ).toMatchInlineSnapshot(`
      [
        {
          "name": "Team/svc",
          "url": "https://jenkins.example.com/job/Team/job/svc/",
        },
      ]
    `)
  })

  it("jenkins_list_jobs recurses into nested containers", async () => {
    expect(
      await call("jenkins_list_jobs", {
        recursive: true,
        includeFolders: false,
      }),
    ).toMatchInlineSnapshot(`
      [
        {
          "name": "app",
          "url": "https://jenkins.example.com/job/app/",
        },
        {
          "name": "deploy",
          "url": "https://jenkins.example.com/job/deploy/",
        },
        {
          "name": "empty",
          "url": "https://jenkins.example.com/job/empty/",
        },
        {
          "name": "Team/svc",
          "url": "https://jenkins.example.com/job/Team/job/svc/",
        },
        {
          "name": "repo/feature/x",
          "url": "https://jenkins.example.com/job/repo/job/feature%2Fx/",
        },
      ]
    `)
  })

  it("jenkins_list_jobs names a missing folder", async () => {
    expect(
      await failure(call("jenkins_list_jobs", { folder: "Nope" })),
    ).toMatchInlineSnapshot(`
      {
        "code": "JOB_NOT_FOUND",
        "message": "Job not found: Nope",
      }
    `)
  })

  it("jenkins_search_jobs filters by substring", async () => {
    expect(
      await call("jenkins_search_jobs", { query: "SV", recursive: true }),
    ).toMatchInlineSnapshot(`
      [
        {
          "name": "Team/svc",
          "url": "https://jenkins.example.com/job/Team/job/svc/",
        },
      ]
    `)
    expect(await call("jenkins_search_jobs", { query: "  " })).toEqual([])
  })

  it("jenkins_get_job_parameters", async () => {
    expect(
      await call("jenkins_get_job_parameters", { jobName: "deploy" }),
    ).toMatchInlineSnapshot(`
      {
        "jobName": "deploy",
        "parameters": [
          {
            "choices": [
              "dev",
              "prod",
            ],
            "defaultValue": "dev",
            "description": "Target",
            "name": "ENV",
            "type": "choice",
          },
          {
            "defaultValue": true,
            "description": "",
            "name": "DRY_RUN",
            "type": "boolean",
          },
        ],
      }
    `)
  })

  it("jenkins_get_job_config", async () => {
    expect(
      await call("jenkins_get_job_config", { jobName: "app" }),
    ).toMatchInlineSnapshot(`
      {
        "config": "<project><description>app</description></project>",
        "jobName": "app",
      }
    `)
  })

  it.each([
    ["jenkins_enable_job", { jobName: "app" }],
    ["jenkins_disable_job", { jobName: "app" }],
    ["jenkins_delete_job", { jobName: "app" }],
    ["jenkins_update_job_config", { jobName: "app", configXml: "<project/>" }],
    ["jenkins_rename_job", { jobName: "app", newName: "app2" }],
    ["jenkins_create_job", { jobName: "Team/new", configXml: "<project/>" }],
    ["jenkins_copy_job", { fromName: "app", newName: "Team/copy" }],
  ])("%s", async (tool, input) => {
    expect(await call(tool, input)).toMatchSnapshot()
  })
})

describe("builds", () => {
  it("jenkins_get_job_status returns the last build", async () => {
    expect(
      await call("jenkins_get_job_status", { jobName: "app" }),
    ).toMatchInlineSnapshot(`
      {
        "durationMs": 61000,
        "id": "3",
        "result": "FAILURE",
        "timestamp": "2026-11-01T09:00:03.000Z",
        "url": "https://jenkins.example.com/job/app/3/",
      }
    `)
  })

  it("jenkins_get_job_status tells a never-built job from a missing one", async () => {
    expect(
      await failure(call("jenkins_get_job_status", { jobName: "empty" })),
    ).toMatchInlineSnapshot(`
      {
        "code": "NO_BUILDS",
        "message": "Job empty has no builds yet",
      }
    `)
    expect(
      await failure(call("jenkins_get_job_status", { jobName: "nope" })),
    ).toMatchInlineSnapshot(`
      {
        "code": "JOB_NOT_FOUND",
        "message": "Job not found: nope",
      }
    `)
  })

  it("jenkins_get_build_status", async () => {
    expect(
      await call("jenkins_get_build_status", {
        jobName: "app",
        buildNumber: 1,
      }),
    ).toMatchInlineSnapshot(`
      {
        "durationMs": 0,
        "id": "1",
        "result": "RUNNING",
        "timestamp": "2026-11-01T09:00:01.000Z",
        "url": "https://jenkins.example.com/job/app/1/",
      }
    `)
    expect(
      await failure(
        call("jenkins_get_build_status", { jobName: "app", buildNumber: 99 }),
      ),
    ).toMatchInlineSnapshot(`
      {
        "code": "BUILD_NOT_FOUND",
        "message": "Build 99 not found for job app",
      }
    `)
  })

  it("jenkins_get_recent_builds", async () => {
    expect(
      await call("jenkins_get_recent_builds", { jobName: "app", limit: 2 }),
    ).toMatchInlineSnapshot(`
      [
        {
          "durationMs": 61000,
          "id": "3",
          "result": "FAILURE",
          "timestamp": "2026-11-01T09:00:03.000Z",
          "url": "https://jenkins.example.com/job/app/3/",
        },
        {
          "durationMs": 42000,
          "id": "2",
          "result": "SUCCESS",
          "timestamp": "2026-11-01T09:00:02.000Z",
          "url": "https://jenkins.example.com/job/app/2/",
        },
      ]
    `)
    expect(
      await failure(
        call("jenkins_get_recent_builds", { jobName: "app", limit: 0 }),
      ),
    ).toMatchInlineSnapshot(`
      {
        "code": "INVALID_INPUT",
        "message": "limit must be a positive whole number",
      }
    `)
  })

  it("jenkins_get_build_changes", async () => {
    expect(
      await call("jenkins_get_build_changes", {
        jobName: "app",
        buildNumber: 3,
      }),
    ).toMatchInlineSnapshot(`
      {
        "buildNumber": 3,
        "changes": [
          {
            "author": "Ada",
            "commitId": "abc123",
            "message": "fix auth",
            "timestamp": "2026-11-01T09:00:00.000Z",
          },
        ],
        "jobName": "app",
      }
    `)
  })

  it("jenkins_get_pipeline_stages, and a build without stage data", async () => {
    expect(
      await call("jenkins_get_pipeline_stages", {
        jobName: "app",
        buildNumber: 3,
      }),
    ).toMatchInlineSnapshot(`
      {
        "buildNumber": 3,
        "jobName": "app",
        "stages": [
          {
            "durationMillis": 1000,
            "id": "6",
            "name": "Checkout",
            "pauseDurationMillis": 0,
            "startTimeMillis": 1793523600000,
            "status": "SUCCESS",
          },
          {
            "durationMillis": 50000,
            "id": "12",
            "name": "Test",
            "pauseDurationMillis": 0,
            "startTimeMillis": 1793523601000,
            "status": "FAILED",
          },
          {
            "durationMillis": 10,
            "id": "20",
            "name": "Deploy",
            "pauseDurationMillis": 0,
            "startTimeMillis": 1793523651000,
            "status": "FAILED",
          },
        ],
        "status": "FAILED",
      }
    `)
    expect(
      await call("jenkins_get_pipeline_stages", {
        jobName: "app",
        buildNumber: 2,
      }),
    ).toMatchInlineSnapshot(`
      {
        "buildNumber": 2,
        "jobName": "app",
        "message": "Not a pipeline build or workflow API not available",
      }
    `)
  })

  it("jenkins_get_test_results, and a build without a report", async () => {
    expect(
      await call("jenkins_get_test_results", {
        jobName: "app",
        buildNumber: 3,
      }),
    ).toMatchSnapshot()
    expect(
      await call("jenkins_get_test_results", {
        jobName: "app",
        buildNumber: 2,
      }),
    ).toMatchInlineSnapshot(`
      {
        "buildNumber": 2,
        "failedTests": 0,
        "jobName": "app",
        "message": "No test results found",
        "passedTests": 0,
        "skippedTests": 0,
        "totalTests": 0,
      }
    `)
    expect(
      await failure(
        call("jenkins_get_test_results", { jobName: "app", buildNumber: 99 }),
      ),
    ).toMatchInlineSnapshot(`
      {
        "code": "BUILD_NOT_FOUND",
        "message": "Build 99 not found for job app",
      }
    `)
  })

  it("jenkins_list_artifacts and jenkins_get_artifact", async () => {
    expect(
      await call("jenkins_list_artifacts", { jobName: "app", buildNumber: 3 }),
    ).toMatchInlineSnapshot(`
      [
        {
          "fileName": "out.txt",
          "relativePath": "dist/out.txt",
          "url": "https://jenkins.example.com/job/app/3/artifact/dist/out.txt",
        },
      ]
    `)
    expect(
      await call("jenkins_get_artifact", {
        jobName: "app",
        buildNumber: 3,
        relativePath: "dist/out.txt",
      }),
    ).toMatchInlineSnapshot(`
      {
        "base64": "aGVsbG8=",
        "fileName": "out.txt",
        "relativePath": "dist/out.txt",
        "size": 5,
      }
    `)
    expect(
      await failure(
        call("jenkins_get_artifact", {
          jobName: "app",
          buildNumber: 3,
          relativePath: "nope.txt",
        }),
      ),
    ).toMatchInlineSnapshot(`
      {
        "code": "ARTIFACT_NOT_FOUND",
        "message": "Artifact not found: nope.txt",
      }
    `)
  })

  it.each([
    ["jenkins_stop_build", { jobName: "app", buildNumber: 1 }],
    ["jenkins_delete_build", { jobName: "app", buildNumber: 2 }],
    ["jenkins_replay_build", { jobName: "app", buildNumber: 3 }],
  ])("%s", async (tool, input) => {
    expect(await call(tool, input)).toMatchSnapshot()
  })

  it("jenkins_stop_build names a missing build", async () => {
    expect(
      await failure(
        call("jenkins_stop_build", { jobName: "app", buildNumber: 99 }),
      ),
    ).toMatchInlineSnapshot(`
      {
        "code": "BUILD_NOT_FOUND",
        "message": "Build 99 not found for job app",
      }
    `)
  })
})

describe("console log", () => {
  const summarise = (r: any) => ({
    ...r,
    text: r.text === undefined ? undefined : r.text.split("\n").length,
  })

  it("defaults to the capped tail", async () => {
    const r: any = await call("jenkins_get_console_log", {
      jobName: "app",
      buildNumber: 3,
    })
    expect(summarise(r)).toMatchInlineSnapshot(`
      {
        "buildNumber": 3,
        "jobName": "app",
        "logSnippet": "line 1
      line 2
      line 3
      line 4
      line 5
      line 6
      line 7
      line 8
      line 9
      line 10
      line 11
      line 12
      line 13
      line 14
      line 15
      line 16
      line 17
      line 18
      line 19
      line 20
      line 21
      line 22
      line 23
      line 24
      line 25
      line 26
      l",
        "returnedBytes": 4500,
        "startByte": 792,
        "text": 501,
        "totalBytes": 5292,
        "truncated": true,
      }
    `)
    expect(r.text.startsWith("line 101\n")).toBe(true)
  })

  it("defaults to the last build", async () => {
    const r: any = await call("jenkins_get_console_log", { jobName: "app" })
    expect(r.buildNumber).toBe(3)
  })

  it("pages from a byte offset", async () => {
    expect(
      await call("jenkins_get_console_log", {
        jobName: "app",
        buildNumber: 3,
        start: 0,
        maxBytes: 20,
      }),
    ).toMatchInlineSnapshot(`
      {
        "buildNumber": 3,
        "jobName": "app",
        "logSnippet": "line 1
      line 2
      line 3",
        "moreData": false,
        "nextStart": 21,
        "returnedBytes": 21,
        "startByte": 0,
        "text": "line 1
      line 2
      line 3
      ",
        "truncated": true,
      }
    `)
  })

  it("searches by pattern", async () => {
    expect(
      await call("jenkins_get_console_log", {
        jobName: "app",
        buildNumber: 3,
        pattern: "^line 59[0-2]$",
      }),
    ).toMatchInlineSnapshot(`
      {
        "buildNumber": 3,
        "jobName": "app",
        "logSnippet": "line 1
      line 2
      line 3
      line 4
      line 5
      line 6
      line 7
      line 8
      line 9
      line 10
      line 11
      line 12
      line 13
      line 14
      line 15
      line 16
      line 17
      line 18
      line 19
      line 20
      line 21
      line 22
      line 23
      line 24
      line 25
      line 26
      l",
        "matches": [
          {
            "line": 590,
            "text": "line 590",
          },
          {
            "line": 591,
            "text": "line 591",
          },
          {
            "line": 592,
            "text": "line 592",
          },
        ],
        "pattern": "^line 59[0-2]$",
        "returnedBytes": 27,
        "totalBytes": 5292,
        "totalMatches": 3,
        "truncated": false,
      }
    `)
  })

  it("validates its options", async () => {
    expect(
      await failure(
        call("jenkins_get_console_log", { jobName: "app", start: -1 }),
      ),
    ).toMatchInlineSnapshot(`
      {
        "code": "INVALID_INPUT",
        "message": "start must be a non-negative whole number of bytes",
      }
    `)
  })
})

describe("trigger", () => {
  it("triggers a job without parameters", async () => {
    expect(
      await call("jenkins_trigger_build", { jobName: "app" }),
    ).toMatchInlineSnapshot(`
      {
        "jobName": "app",
        "queueUrl": "https://jenkins.example.com/queue/item/42/",
      }
    `)
  })

  it("refuses to leave parameters to Jenkins' defaults", async () => {
    expect(
      await failure(call("jenkins_trigger_build", { jobName: "deploy" })),
    ).toMatchInlineSnapshot(`
      {
        "code": "PARAMETERS_REQUIRED",
        "message": "Job deploy has parameters that were not passed: ENV (ChoiceParameterDefinition, default dev), DRY_RUN (BooleanParameterDefinition, default true). Pass them in params, or set useDefaults: true to let Jenkins fill them.",
      }
    `)
  })

  it("rejects unknown parameters", async () => {
    expect(
      await failure(
        call("jenkins_trigger_build", {
          jobName: "deploy",
          params: { NOPE: 1 },
        }),
      ),
    ).toMatchInlineSnapshot(`
      {
        "code": "INVALID_INPUT",
        "message": "Unknown parameters for job deploy: NOPE. Valid parameters: ENV, DRY_RUN.",
      }
    `)
  })

  it("posts every parameter", async () => {
    expect(
      await call("jenkins_trigger_build", {
        jobName: "deploy",
        params: { ENV: "prod", DRY_RUN: false },
      }),
    ).toMatchInlineSnapshot(`
      {
        "jobName": "deploy",
        "queueUrl": "https://jenkins.example.com/queue/item/42/",
      }
    `)
    const post = fake.requests.find((r) =>
      r.path.endsWith("/buildWithParameters"),
    )
    expect(post?.body).toBe("ENV=prod&DRY_RUN=false")
  })

  it("lets Jenkins fill defaults when asked", async () => {
    expect(
      await call("jenkins_trigger_build", {
        jobName: "deploy",
        useDefaults: true,
      }),
    ).toMatchInlineSnapshot(`
      {
        "jobName": "deploy",
        "queueUrl": "https://jenkins.example.com/queue/item/42/",
      }
    `)
  })

  it("names a missing job", async () => {
    expect(
      await failure(call("jenkins_trigger_build", { jobName: "nope" })),
    ).toMatchInlineSnapshot(`
      {
        "code": "JOB_NOT_FOUND",
        "message": "Job not found: nope",
      }
    `)
  })
})

describe("instance", () => {
  it.each([
    ["jenkins_get_queue", {}],
    ["jenkins_cancel_queue", { queueId: 41 }],
    ["jenkins_list_nodes", {}],
    ["jenkins_get_node", { nodeName: "agent-1" }],
    [
      "jenkins_toggle_node_offline",
      { nodeName: "agent-1", offlineMessage: "patching" },
    ],
    ["jenkins_list_views", {}],
    ["jenkins_get_view", { viewName: "all" }],
    ["jenkins_get_system_info", {}],
    ["jenkins_get_version", {}],
    ["jenkins_get_plugins", {}],
    ["jenkins_quiet_down", { confirm: true, reason: "upgrade" }],
    ["jenkins_cancel_quiet_down", {}],
    ["jenkins_safe_restart", { confirm: true }],
  ])("%s", async (tool, input) => {
    expect(await call(tool, input)).toMatchSnapshot()
  })

  it("names a missing node or view", async () => {
    expect(
      await failure(call("jenkins_get_node", { nodeName: "ghost" })),
    ).toMatchInlineSnapshot(`
      {
        "code": "NODE_NOT_FOUND",
        "message": "Node not found: ghost",
      }
    `)
    expect(
      await failure(call("jenkins_get_view", { viewName: "ghost" })),
    ).toMatchInlineSnapshot(`
      {
        "code": "VIEW_NOT_FOUND",
        "message": "View not found: ghost",
      }
    `)
  })

  it("sends the configured credentials", async () => {
    await call("jenkins_get_system_info")
    expect(fake.requests[0].headers.authorization).toBe(
      "Basic " + Buffer.from("u:t").toString("base64"),
    )
  })
})

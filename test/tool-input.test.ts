// Tool arguments are validated before dispatch. The low-level MCP Server does
// not check them against inputSchema, and several end up in a Jenkins URL, so
// a hostile string must be refused before any client method runs.
import { describe, it, expect, vi, beforeEach } from "vitest"
import { toolHandlers } from "../src/tool-handlers.js"
import { rawTools } from "../src/tool-manifest.js"
import { getArtifact } from "../src/tools/get-artifact.js"
import { stopBuild } from "../src/tools/stop-build.js"
import { deleteBuild } from "../src/tools/delete-build.js"
import { replayBuild } from "../src/tools/replay-build.js"
import type { JenkinsClient } from "../src/lib/client.js"

let client: Record<string, ReturnType<typeof vi.fn>>

beforeEach(() => {
  client = {
    downloadArtifact: vi.fn(async () => Buffer.from("artifact")),
    stopBuild: vi.fn(async () => ({ stopped: true })),
    deleteBuild: vi.fn(async () => ({ deleted: true })),
    replayBuild: vi.fn(async () => ({ queueUrl: "q" })),
    cancelQueueItem: vi.fn(async () => undefined),
    getNode: vi.fn(async () => ({})),
    getView: vi.fn(async () => ({ jobs: [] })),
    quietDown: vi.fn(async () => ({})),
    tree: vi.fn(async () => ({})),
  }
})

const call = (tool: string, input: unknown) =>
  toolHandlers[tool](client as unknown as JenkinsClient, input)

const rejection = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e: any) {
    return { code: e.code, message: String(e.message) }
  }
  throw new Error("expected the call to be refused")
}

const noClientCalls = () => {
  for (const fn of Object.values(client)) expect(fn).not.toHaveBeenCalled()
}

const HOSTILE_BUILD_NUMBERS: unknown[] = [
  "7/../../victim/doDelete?x=",
  "7/stop",
  "../7",
  "7?x=1",
  "",
  "0",
  0,
  -1,
  1.5,
  Number.NaN,
  true,
  {},
  ["7"],
]

describe("build numbers are whole numbers or permalinks", () => {
  for (const tool of [
    "jenkins_stop_build",
    "jenkins_delete_build",
    "jenkins_replay_build",
    "jenkins_get_artifact",
  ]) {
    for (const buildNumber of HOSTILE_BUILD_NUMBERS) {
      it(`${tool} refuses buildNumber ${JSON.stringify(buildNumber)}`, async () => {
        const err = await rejection(
          call(tool, {
            jobName: "app",
            buildNumber,
            relativePath: "dist/app.jar",
          }),
        )
        expect(err.code).toBe("INVALID_INPUT")
        expect(err.message).toContain(`Invalid arguments for tool ${tool}`)
        expect(err.message).toContain("buildNumber")
        noClientCalls()
      })
    }
  }

  it("accepts an integer, a digit string and a permalink", async () => {
    await call("jenkins_stop_build", { jobName: "app", buildNumber: 7 })
    await call("jenkins_stop_build", { jobName: "app", buildNumber: "8" })
    await call("jenkins_stop_build", {
      jobName: "app",
      buildNumber: "lastBuild",
    })
    expect(client.stopBuild.mock.calls).toEqual([
      ["app", 7],
      ["app", 8],
      ["app", "lastBuild"],
    ])
  })
})

describe("artifact paths stay inside the build's artifacts", () => {
  for (const relativePath of [
    "../../../victim/doDelete",
    "dist/../../../x",
    "dist/%2e%2e/%2E%2E/x",
    "./app.jar",
    "/etc/passwd",
    "dist//app.jar",
    "dist/",
    "app.jar?x=1",
    "app.jar#frag",
    "dist\\..\\x",
    "app\n.jar",
    "",
    42,
  ]) {
    it(`refuses relativePath ${JSON.stringify(relativePath)}`, async () => {
      const err = await rejection(
        call("jenkins_get_artifact", {
          jobName: "app",
          buildNumber: 7,
          relativePath,
        }),
      )
      expect(err.code).toBe("INVALID_INPUT")
      expect(err.message).toContain("relativePath")
      noClientCalls()
    })
  }

  it("still downloads an ordinary nested artifact", async () => {
    const result = await call("jenkins_get_artifact", {
      jobName: "folder/app",
      buildNumber: 7,
      relativePath: "dist/app-1.2.jar",
    })
    expect(client.downloadArtifact).toHaveBeenCalledWith(
      "folder/app",
      7,
      "dist/app-1.2.jar",
    )
    expect(result).toMatchObject({ fileName: "app-1.2.jar", size: 8 })
  })
})

describe("names that become URL segments", () => {
  it("refuses dot segments in a job name", async () => {
    for (const jobName of ["..", "a/../../b", "a/./b"]) {
      const err = await rejection(
        call("jenkins_delete_build", { jobName, buildNumber: 1 }),
      )
      expect(err.message).toContain("jobName")
    }
    noClientCalls()
  })

  it("keeps multibranch names with slashes", async () => {
    await call("jenkins_delete_build", {
      jobName: "repo/feature/x",
      buildNumber: 3,
    })
    expect(client.deleteBuild).toHaveBeenCalledWith("repo/feature/x", 3)
  })

  it("refuses a node or view name of ..", async () => {
    expect(
      (await rejection(call("jenkins_get_node", { nodeName: ".." }))).code,
    ).toBe("INVALID_INPUT")
    expect(
      (await rejection(call("jenkins_get_view", { viewName: ".." }))).code,
    ).toBe("INVALID_INPUT")
    noClientCalls()
  })

  it("refuses a queue id that is not a whole number", async () => {
    for (const queueId of ["1&delay=0", 1.5, 0])
      await rejection(call("jenkins_cancel_queue", { queueId }))
    noClientCalls()
  })
})

describe("schema types and required properties", () => {
  it("refuses a string where the confirm gate expects a boolean", async () => {
    const err = await rejection(
      call("jenkins_quiet_down", { confirm: "true" }),
    )
    expect(err.message).toContain("confirm must be of type boolean")
    noClientCalls()
  })

  it("refuses a missing required argument", async () => {
    const err = await rejection(call("jenkins_stop_build", { jobName: "app" }))
    expect(err.message).toContain("buildNumber is required")
    noClientCalls()
  })

  it("refuses arguments that are not an object", async () => {
    await rejection(call("jenkins_stop_build", ["app", 7]))
    await rejection(call("jenkins_stop_build", "app"))
    noClientCalls()
  })

  it("treats an optional argument sent as null as absent", async () => {
    await call("jenkins_replay_build", {
      jobName: "app",
      buildNumber: 4,
      mainScript: null,
    })
    expect(client.replayBuild).toHaveBeenCalledWith("app", 4, undefined)
  })

  it("has a schema for every handler", () => {
    const names = new Set(rawTools.map((t) => t.name))
    for (const name of Object.keys(toolHandlers))
      expect(names.has(name)).toBe(true)
  })
})

describe("tool functions check their own URL inputs", () => {
  const c = () => client as unknown as JenkinsClient
  const hostile = {
    jobName: "app",
    buildNumber: "7/../../victim/doDelete?x=" as unknown as number,
    relativePath: "x",
  }

  it("for direct callers that bypass dispatch", async () => {
    await rejection(getArtifact(c(), hostile))
    await rejection(
      getArtifact(c(), { ...hostile, buildNumber: 7, relativePath: "../x" }),
    )
    await rejection(stopBuild(c(), hostile))
    await rejection(deleteBuild(c(), hostile))
    await rejection(replayBuild(c(), hostile))
    noClientCalls()
  })
})

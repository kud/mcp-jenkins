// Read-only by default. Write tools are exposed only with
// MCP_JENKINS_ALLOW_WRITE=1 or by naming them in MCP_JENKINS_ALLOW_TOOLS, and
// the irreversible ones also need confirm: true. These tests pin how every
// configuration that worked before this change behaves now.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { fileURLToPath } from "node:url"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { loadToolFilter } from "../src/common/env.js"
import { isWriteTool, selectTools } from "../src/tool-filter.js"
import { rawTools } from "../src/tool-manifest.js"
import { toolHandlers } from "../src/tool-handlers.js"
import { deleteJob } from "../src/tools/delete-job.js"
import { deleteBuild } from "../src/tools/delete-build.js"
import { updateJobConfig } from "../src/tools/update-job-config.js"
import { replayBuild } from "../src/tools/replay-build.js"
import type { JenkinsClient } from "../src/lib/client.js"

// Every tool that changes Jenkins. Adding a write tool means adding it here,
// deliberately: it will be hidden by default.
const WRITE_TOOLS = [
  "jenkins_trigger_build",
  "jenkins_stop_build",
  "jenkins_delete_build",
  "jenkins_replay_build",
  "jenkins_cancel_queue",
  "jenkins_enable_job",
  "jenkins_disable_job",
  "jenkins_delete_job",
  "jenkins_create_job",
  "jenkins_update_job_config",
  "jenkins_rename_job",
  "jenkins_copy_job",
  "jenkins_toggle_node_offline",
  "jenkins_quiet_down",
  "jenkins_cancel_quiet_down",
  "jenkins_safe_restart",
].sort()

const IRREVERSIBLE = [
  "jenkins_delete_job",
  "jenkins_delete_build",
  "jenkins_update_job_config",
  "jenkins_replay_build",
]

const ENV_KEYS = [
  "MCP_JENKINS_ALLOW_WRITE",
  "MCP_JENKINS_ALLOW_TOOLS",
  "MCP_JENKINS_BLOCK_TOOLS",
]
afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k]
})

const exposed = () =>
  selectTools(rawTools, loadToolFilter())
    .map((t) => t.name)
    .sort()

describe("which tools are writes", () => {
  it("is exactly the tools not annotated read-only", () => {
    expect(
      rawTools
        .filter(isWriteTool)
        .map((t) => t.name)
        .sort(),
    ).toEqual(WRITE_TOOLS)
  })
})

describe("read-only by default", () => {
  it("previous default (no filter env): only read tools are exposed now", () => {
    const names = exposed()
    for (const w of WRITE_TOOLS) expect(names).not.toContain(w)
    expect(names).toHaveLength(rawTools.length - WRITE_TOOLS.length)
    expect(names).toContain("jenkins_get_console_log")
  })

  it("previous blocklist-only setup: still read-only, a blocklist adds nothing", () => {
    process.env.MCP_JENKINS_BLOCK_TOOLS = "jenkins_delete_job"
    const names = exposed()
    expect(names).not.toContain("jenkins_trigger_build")
    expect(names).not.toContain("jenkins_delete_job")
  })

  it("previous allowlist naming write tools: those stay exposed", () => {
    process.env.MCP_JENKINS_ALLOW_TOOLS =
      "jenkins_list_jobs,jenkins_trigger_build"
    expect(exposed()).toEqual(["jenkins_list_jobs", "jenkins_trigger_build"])
  })

  for (const value of ["1", "true", "TRUE", "yes", "on"]) {
    it(`MCP_JENKINS_ALLOW_WRITE=${value} exposes every tool`, () => {
      process.env.MCP_JENKINS_ALLOW_WRITE = value
      expect(exposed()).toHaveLength(rawTools.length)
    })
  }

  for (const value of ["0", "false", "", "no"]) {
    it(`MCP_JENKINS_ALLOW_WRITE=${JSON.stringify(value)} stays read-only`, () => {
      process.env.MCP_JENKINS_ALLOW_WRITE = value
      expect(exposed()).not.toContain("jenkins_trigger_build")
    })
  }

  it("writes on with a blocklist hides only the blocked writes", () => {
    process.env.MCP_JENKINS_ALLOW_WRITE = "1"
    process.env.MCP_JENKINS_BLOCK_TOOLS = "jenkins_delete_job"
    const names = exposed()
    expect(names).not.toContain("jenkins_delete_job")
    expect(names).toContain("jenkins_trigger_build")
  })
})

describe("irreversible tools require confirm: true", () => {
  let client: Record<string, ReturnType<typeof vi.fn>>
  beforeEach(() => {
    client = {
      deleteJob: vi.fn(async () => undefined),
      deleteBuild: vi.fn(async () => ({})),
      updateJobConfig: vi.fn(async () => ({})),
      replayBuild: vi.fn(async () => ({ queueUrl: "q" })),
    }
  })
  const c = () => client as unknown as JenkinsClient
  const base = { jobName: "app", buildNumber: 3, configXml: "<project/>" }

  it("declares confirm as a required boolean in each schema", () => {
    for (const name of IRREVERSIBLE) {
      const schema = rawTools.find((t) => t.name === name)!.inputSchema
      expect(schema.required).toContain("confirm")
      expect((schema.properties as any).confirm.type).toBe("boolean")
    }
  })

  for (const name of IRREVERSIBLE) {
    it(`${name}: a previous call without confirm is refused`, async () => {
      await expect(toolHandlers[name](c(), { ...base })).rejects.toMatchObject({
        code: "INVALID_INPUT",
      })
      await expect(
        toolHandlers[name](c(), { ...base, confirm: false }),
      ).rejects.toMatchObject({ code: "CONFIRM_REQUIRED" })
      for (const fn of Object.values(client)) expect(fn).not.toHaveBeenCalled()
    })

    it(`${name}: runs with confirm: true`, async () => {
      await toolHandlers[name](c(), { ...base, confirm: true })
      const called = Object.values(client).filter((fn) => fn.mock.calls.length)
      expect(called).toHaveLength(1)
    })
  }

  it("is enforced in the tool functions too, for direct callers", async () => {
    for (const run of [
      () => deleteJob(c(), { jobName: "app" }),
      () => deleteBuild(c(), { jobName: "app", buildNumber: 3 }),
      () => updateJobConfig(c(), { jobName: "app", configXml: "<x/>" }),
      () =>
        replayBuild(c(), {
          jobName: "app",
          buildNumber: 3,
          mainScript: "evil()",
        }),
    ])
      await expect(run()).rejects.toMatchObject({ code: "CONFIRM_REQUIRED" })
    for (const fn of Object.values(client)) expect(fn).not.toHaveBeenCalled()
  })
})

// End to end: the server process, as an MCP client starts it.
const startServer = async (env: Record<string, string>) => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      fileURLToPath(
        new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url),
      ),
      fileURLToPath(new URL("../src/index.ts", import.meta.url)),
    ],
    env: {
      PATH: process.env.PATH ?? "",
      MCP_JENKINS_URL: "https://jenkins.invalid",
      MCP_JENKINS_BEARER_TOKEN: "x",
      ...env,
    },
    stderr: "ignore",
  })
  const client = new Client({ name: "test", version: "0" })
  await client.connect(transport)
  return client
}

describe("over stdio", () => {
  it("a default server lists no write tool and refuses one by name", async () => {
    const client = await startServer({})
    try {
      const { tools } = await client.listTools()
      const names = tools.map((t) => t.name)
      for (const w of WRITE_TOOLS) expect(names).not.toContain(w)
      await expect(
        client.callTool({
          name: "jenkins_replay_build",
          arguments: {
            jobName: "app",
            buildNumber: 1,
            mainScript: "evil()",
            confirm: true,
          },
        }),
      ).rejects.toThrow("Unknown tool: jenkins_replay_build")
    } finally {
      await client.close()
    }
  }, 20000)

  it("MCP_JENKINS_ALLOW_WRITE=1 lists the write tools, annotations intact", async () => {
    const client = await startServer({ MCP_JENKINS_ALLOW_WRITE: "1" })
    try {
      const { tools } = await client.listTools()
      const replay = tools.find((t) => t.name === "jenkins_replay_build")
      expect(replay?.annotations?.readOnlyHint).toBe(false)
      expect(
        tools.find((t) => t.name === "jenkins_delete_job")?.annotations,
      ).toMatchObject({ destructiveHint: true })
    } finally {
      await client.close()
    }
  }, 20000)
})

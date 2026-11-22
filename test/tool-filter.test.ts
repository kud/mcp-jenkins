import { describe, it, expect } from "vitest"
import { fileURLToPath } from "node:url"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { selectTools } from "../src/tool-filter.js"
import { rawTools } from "../src/tool-manifest.js"

const names = (filter: Parameters<typeof selectTools>[1]) =>
  selectTools(rawTools, filter).map((t) => t.name)

describe("selectTools", () => {
  it("exposes every tool with no filter", () => {
    expect(names({ allowlist: null, blocklist: [] })).toHaveLength(
      rawTools.length,
    )
  })

  it("drops blocked tools", () => {
    const exposed = names({
      allowlist: null,
      blocklist: ["jenkins_delete_job"],
    })
    expect(exposed).not.toContain("jenkins_delete_job")
    expect(exposed).toContain("jenkins_list_jobs")
  })

  it("lets an allowlist win over a blocklist", () => {
    expect(
      names({
        allowlist: ["jenkins_list_jobs"],
        blocklist: ["jenkins_list_jobs"],
      }),
    ).toEqual(["jenkins_list_jobs"])
  })
})

// End to end over stdio: index.ts starts the server on import, so it is
// spawned as a process, as an MCP client would.
describe("tools/call honours the filter", () => {
  it("refuses a blocked tool by name, before any request", async () => {
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
        MCP_JENKINS_BLOCK_TOOLS: "jenkins_delete_job",
      },
      stderr: "ignore",
    })
    const client = new Client({ name: "test", version: "0" })
    await client.connect(transport)
    try {
      const { tools } = await client.listTools()
      expect(tools.map((t) => t.name)).not.toContain("jenkins_delete_job")
      await expect(
        client.callTool({
          name: "jenkins_delete_job",
          arguments: { jobName: "app" },
        }),
      ).rejects.toThrow("Unknown tool: jenkins_delete_job")
    } finally {
      await client.close()
    }
  }, 20000)
})

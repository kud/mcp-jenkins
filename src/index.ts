#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js"
import {
  logger,
  errorResponse,
  guardToolResultText,
  McpError,
  loadAllJenkinsInstances,
  loadToolFilter,
  getInstanceNames,
  CliArgs,
} from "./common/index.js"
import { JenkinsClient, createJenkinsClient } from "./lib/client.js"

const instanceProperty = {
  instance: {
    type: "string",
    description:
      "Jenkins instance name (optional — defaults to first configured instance)",
  },
}

const injectInstance = (tool: Tool): Tool => ({
  ...tool,
  inputSchema: {
    ...tool.inputSchema,
    properties: {
      ...instanceProperty,
      ...(tool.inputSchema.properties as object),
    },
  },
})

import { rawTools } from "./tool-manifest.js"
import { toolHandlers } from "./tool-handlers.js"

const { allowlist, blocklist } = loadToolFilter()

if (allowlist && blocklist.length) {
  logger.warn(
    "Both JENKINS_TOOLS and JENKINS_BLOCK_TOOLS are set — JENKINS_BLOCK_TOOLS will be ignored",
  )
}

const filteredRawTools = allowlist
  ? rawTools.filter((t) => allowlist.includes(t.name))
  : blocklist.length
    ? rawTools.filter((t) => !blocklist.includes(t.name))
    : rawTools

if (allowlist) {
  logger.info("Tool allowlist active", { tools: allowlist })
} else if (blocklist.length) {
  logger.info("Tool blocklist active", { blocked: blocklist })
}

const tools = filteredRawTools.map(injectInstance)


// Parse CLI arguments
const parseCliArgs = (): CliArgs => {
  const args: CliArgs = {}
  const argv = process.argv.slice(2)

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const nextArg = argv[i + 1]

    switch (arg) {
      case "--url":
        if (nextArg && !nextArg.startsWith("--")) {
          args.jenkinsUrl = nextArg
          i++
        }
        break
      case "--user":
        if (nextArg && !nextArg.startsWith("--")) {
          args.jenkinsUser = nextArg
          i++
        }
        break
      case "--api-token":
        if (nextArg && !nextArg.startsWith("--")) {
          args.jenkinsApiToken = nextArg
          i++
        }
        break
      case "--bearer-token":
        if (nextArg && !nextArg.startsWith("--")) {
          args.jenkinsBearerToken = nextArg
          i++
        }
        break
      case "--anonymous":
        args.jenkinsAnonymous = true
        break
      case "--timeout-ms":
        if (nextArg && !nextArg.startsWith("--")) {
          args.jenkinsTimeoutMs = nextArg
          i++
        }
        break
      case "--help":
      case "-h":
        console.log(`
Jenkins MCP Server

Usage: mcp-jenkins [OPTIONS]

Configuration Priority (highest to lowest):
  1. CLI arguments (--url, --user, etc.)
  2. MCP_JENKINS_* environment variables

Options:
  --url <url>            Jenkins server URL
  --user <username>      Jenkins username (for Basic auth)
  --api-token <token>    Jenkins API token (for Basic auth)
  --bearer-token <token> Jenkins bearer token (OAuth/token auth)
  --anonymous            No-auth Jenkins instance (no credentials required)
  --timeout-ms <ms>      Per-request deadline (default 30000)
  -h, --help             Show this help message

Authentication:
  Either provide --bearer-token OR both --user and --api-token
  OR use --anonymous for Jenkins instances with no authentication

Slow Jenkins:
  Every request is bounded by one deadline, 30 s by default. A large or busy
  instance can spend even longer answering, which surfaces as
  "Jenkins request timed out" from this server rather than an error from Jenkins.
  Raise it with --timeout-ms 60000 or MCP_JENKINS_TIMEOUT_MS=60000.

Tool Filtering (via environment variables):
  MCP_JENKINS_ALLOW_TOOLS=<tool1>,<tool2>  Allowlist — expose only these tools
  MCP_JENKINS_BLOCK_TOOLS=<tool1>,<tool2>  Blocklist — hide these tools
  If both are set, MCP_JENKINS_ALLOW_TOOLS takes precedence.

Examples:
  # Bearer token auth (via CLI)
  mcp-jenkins --url https://jenkins.example.com --bearer-token abc123

  # Basic auth (via CLI)
  mcp-jenkins --url https://jenkins.example.com --user admin --api-token xyz789

  # Mixed (CLI + env vars)
  MCP_JENKINS_USER=admin mcp-jenkins --url https://jenkins.example.com --api-token xyz789

  # Environment variables only
  MCP_JENKINS_URL=https://jenkins.example.com \\
  MCP_JENKINS_BEARER_TOKEN=abc123 \\
  mcp-jenkins

  # Read-only monitoring (block all write tools)
  MCP_JENKINS_BLOCK_TOOLS=jenkins_trigger_build,jenkins_stop_build,jenkins_delete_build,jenkins_cancel_queue,jenkins_enable_job,jenkins_disable_job,jenkins_delete_job,jenkins_create_job,jenkins_update_job_config,jenkins_rename_job,jenkins_copy_job,jenkins_toggle_node_offline,jenkins_quiet_down,jenkins_cancel_quiet_down,jenkins_safe_restart,jenkins_replay_build \\
  mcp-jenkins --url https://jenkins.example.com --bearer-token abc123

  # Slow instance: give every request 60 s instead of the 30 s default
  mcp-jenkins --url https://jenkins.example.com --bearer-token abc123 --timeout-ms 60000

  # Allowlist — expose only job listing and status tools
  MCP_JENKINS_ALLOW_TOOLS=jenkins_list_jobs,jenkins_get_job_status,jenkins_get_build_status \\
  mcp-jenkins --url https://jenkins.example.com --bearer-token abc123
`)
        process.exit(0)
        break
    }
  }

  return args
}

// Create MCP server instance
const server = new Server(
  {
    name: "jenkins-mcp-server",
    version: "0.9.1",
  },
  {
    capabilities: {
      tools: {},
    },
  },
)

// Parse CLI args and build per-instance client map
const cliArgs = parseCliArgs()
const clients = new Map<string, JenkinsClient>()
let defaultInstance: string

try {
  const instances = loadAllJenkinsInstances(cliArgs)
  for (const [name, env] of instances) {
    clients.set(name, createJenkinsClient(env))
    logger.info("Jenkins client initialized", {
      instance: name,
      url: env.JENKINS_URL,
      authType: env.JENKINS_ANONYMOUS
        ? "anonymous"
        : env.JENKINS_BEARER_TOKEN
          ? "bearer"
          : "basic",
    })
  }
  defaultInstance = instances.keys().next().value as string
} catch (error: any) {
  logger.error("Failed to initialize Jenkins clients", { error: error.message })
  process.exit(1)
}

const resolveClient = (instance?: string): JenkinsClient => {
  const name = instance ?? defaultInstance
  const c = clients.get(name)
  if (!c)
    throw new McpError(
      "INVALID_PARAMS",
      `Unknown instance "${name}". Available: ${Array.from(clients.keys()).join(", ")}`,
      400,
    )
  return c
}

// Handle tool list requests
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools }
})

// Handle tool execution requests
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  try {
    if (name === "jenkins_list_instances") {
      return {
        content: [
          {
            type: "text",
            text: guardToolResultText(
              JSON.stringify(
                Array.from(clients.entries()).map(([instanceName, c]) => ({
                  name: instanceName,
                  url: c.baseUrl,
                })),
                null,
                2,
              ),
            ),
          },
        ],
      }
    }

    const handler = toolHandlers[name]
    if (!handler) {
      throw new McpError("TOOL_NOT_FOUND", `Unknown tool: ${name}`, 404)
    }

    const { instance, ...toolArgs } = (args || {}) as Record<string, any>
    const client = resolveClient(instance)
    const result = await handler(client, toolArgs)

    return {
      content: [
        {
          type: "text",
          text: guardToolResultText(JSON.stringify(result, null, 2)),
        },
      ],
    }
  } catch (error: any) {
    logger.error("Tool execution failed", {
      tool: name,
      error: error.message,
      code: error.code,
    })

    if (error instanceof McpError) {
      throw error
    }

    throw new McpError(
      "EXECUTION_ERROR",
      error.message || "Tool execution failed",
      500,
    )
  }
})

// Start the server with stdio transport
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  logger.info("Jenkins MCP server running on stdio")
}

main().catch((error) => {
  logger.error("Fatal server error", { error: String(error) })
  process.exit(1)
})

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
  McpError,
  loadAllJenkinsInstances,
  loadToolFilter,
  getInstanceNames,
  CliArgs,
} from "./common/index.js"
import { JenkinsClient } from "./lib/jenkins-client.js"
import { getJobStatus } from "./tools/get-job-status.js"
import { getJobParameters } from "./tools/get-job-parameters.js"
import { getBuildStatus } from "./tools/get-build-status.js"
import { getConsoleLog } from "./tools/get-console-log.js"
import { triggerBuild } from "./tools/trigger-build.js"
import { listJobs } from "./tools/list-jobs.js"
import { getRecentBuilds } from "./tools/get-recent-builds.js"
import { listArtifacts } from "./tools/list-artifacts.js"
import { getArtifact } from "./tools/get-artifact.js"
import { searchJobs } from "./tools/search-jobs.js"
import { stopBuild } from "./tools/stop-build.js"
import { deleteBuild } from "./tools/delete-build.js"
import { getTestResults } from "./tools/get-test-results.js"
import { getQueue } from "./tools/get-queue.js"
import { cancelQueue } from "./tools/cancel-queue.js"
import { enableJob } from "./tools/enable-job.js"
import { disableJob } from "./tools/disable-job.js"
import { deleteJob } from "./tools/delete-job.js"
import { getJobConfig } from "./tools/get-job-config.js"
import { listNodes } from "./tools/list-nodes.js"
import { getSystemInfo } from "./tools/get-system-info.js"
import { getVersion } from "./tools/get-version.js"
import { getPlugins } from "./tools/get-plugins.js"
import { getBuildChanges } from "./tools/get-build-changes.js"
import { getPipelineStages } from "./tools/get-pipeline-stages.js"
import { replayBuild } from "./tools/replay-build.js"
import { createJob } from "./tools/create-job.js"
import { updateJobConfig } from "./tools/update-job-config.js"
import { renameJob } from "./tools/rename-job.js"
import { copyJob } from "./tools/copy-job.js"
import { getNode } from "./tools/get-node.js"
import { toggleNodeOffline } from "./tools/toggle-node-offline.js"
import { listViews } from "./tools/list-views.js"
import { getView } from "./tools/get-view.js"
import { quietDown } from "./tools/quiet-down.js"
import { cancelQuietDown } from "./tools/cancel-quiet-down.js"
import { safeRestart } from "./tools/safe-restart.js"

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

// Map tool names to handler functions
type ToolHandler = (client: JenkinsClient, input: any) => Promise<any>
const toolHandlers: Record<string, ToolHandler> = {
  jenkins_list_jobs: listJobs,
  jenkins_search_jobs: searchJobs,
  jenkins_get_job_status: getJobStatus,
  jenkins_get_job_parameters: getJobParameters,
  jenkins_get_build_status: getBuildStatus,
  jenkins_get_recent_builds: getRecentBuilds,
  jenkins_get_console_log: getConsoleLog,
  jenkins_trigger_build: triggerBuild,
  jenkins_list_artifacts: listArtifacts,
  jenkins_get_artifact: getArtifact,
  jenkins_stop_build: stopBuild,
  jenkins_delete_build: deleteBuild,
  jenkins_get_test_results: getTestResults,
  jenkins_get_build_changes: getBuildChanges,
  jenkins_get_pipeline_stages: getPipelineStages,
  jenkins_replay_build: replayBuild,
  jenkins_get_queue: getQueue,
  jenkins_cancel_queue: cancelQueue,
  jenkins_enable_job: enableJob,
  jenkins_disable_job: disableJob,
  jenkins_delete_job: deleteJob,
  jenkins_get_job_config: getJobConfig,
  jenkins_list_nodes: listNodes,
  jenkins_get_system_info: getSystemInfo,
  jenkins_get_version: getVersion,
  jenkins_get_plugins: getPlugins,
  jenkins_create_job: createJob,
  jenkins_update_job_config: updateJobConfig,
  jenkins_rename_job: renameJob,
  jenkins_copy_job: copyJob,
  jenkins_get_node: getNode,
  jenkins_toggle_node_offline: toggleNodeOffline,
  jenkins_list_views: listViews,
  jenkins_get_view: getView,
  jenkins_quiet_down: quietDown,
  jenkins_cancel_quiet_down: cancelQuietDown,
  jenkins_safe_restart: safeRestart,
}

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
  -h, --help             Show this help message

Authentication:
  Either provide --bearer-token OR both --user and --api-token
  OR use --anonymous for Jenkins instances with no authentication

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
    const authHeader = env.JENKINS_ANONYMOUS
      ? undefined
      : env.JENKINS_BEARER_TOKEN
        ? "Bearer " + env.JENKINS_BEARER_TOKEN
        : "Basic " +
          Buffer.from(`${env.JENKINS_USER}:${env.JENKINS_API_TOKEN}`).toString(
            "base64",
          )
    clients.set(
      name,
      new JenkinsClient({ baseUrl: env.JENKINS_URL, authHeader }),
    )
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
            text: JSON.stringify(
              Array.from(clients.entries()).map(([instanceName, c]) => ({
                name: instanceName,
                url: c.baseUrl,
              })),
              null,
              2,
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
          text: JSON.stringify(result, null, 2),
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

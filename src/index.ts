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

// Tool definitions with proper MCP schema
const rawTools: Tool[] = [
  {
    name: "jenkins_list_instances",
    description:
      "List all configured Jenkins instances with their names and URLs",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "jenkins_list_jobs",
    description: "List all Jenkins jobs with their names and URLs",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "jenkins_search_jobs",
    description:
      "Search for Jenkins jobs by name (case-insensitive substring match)",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query to filter jobs by name",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "jenkins_get_job_status",
    description: "Get the status of the last build for a specific job",
    inputSchema: {
      type: "object",
      properties: {
        jobName: {
          type: "string",
          description: "Name of the Jenkins job",
        },
      },
      required: ["jobName"],
    },
  },
  {
    name: "jenkins_get_job_parameters",
    description:
      "Get the parameter definitions for a parameterised Jenkins job — names, types, defaults, and choices",
    inputSchema: {
      type: "object",
      properties: {
        jobName: {
          type: "string",
          description: "Name of the Jenkins job",
        },
      },
      required: ["jobName"],
    },
  },
  {
    name: "jenkins_get_build_status",
    description: "Get detailed status of a specific build number for a job",
    inputSchema: {
      type: "object",
      properties: {
        jobName: {
          type: "string",
          description: "Name of the Jenkins job",
        },
        buildNumber: {
          type: "number",
          description: "Build number to retrieve",
        },
      },
      required: ["jobName", "buildNumber"],
    },
  },
  {
    name: "jenkins_get_recent_builds",
    description: "Get recent builds for a job with their status and metadata",
    inputSchema: {
      type: "object",
      properties: {
        jobName: {
          type: "string",
          description: "Name of the Jenkins job",
        },
        limit: {
          type: "number",
          description: "Maximum number of builds to return (default: 5)",
          default: 5,
        },
      },
      required: ["jobName"],
    },
  },
  {
    name: "jenkins_get_console_log",
    description:
      "Get console log output from a build. Returns both a snippet and full log.",
    inputSchema: {
      type: "object",
      properties: {
        jobName: {
          type: "string",
          description: "Name of the Jenkins job",
        },
        buildNumber: {
          type: "number",
          description: "Build number (optional, defaults to last build)",
        },
      },
      required: ["jobName"],
    },
  },
  {
    name: "jenkins_trigger_build",
    description: "Trigger a new build for a job, optionally with parameters",
    inputSchema: {
      type: "object",
      properties: {
        jobName: {
          type: "string",
          description: "Name of the Jenkins job to trigger",
        },
        params: {
          type: "object",
          description: "Optional build parameters as key-value pairs",
          additionalProperties: true,
        },
      },
      required: ["jobName"],
    },
  },
  {
    name: "jenkins_list_artifacts",
    description: "List all artifacts produced by a specific build",
    inputSchema: {
      type: "object",
      properties: {
        jobName: {
          type: "string",
          description: "Name of the Jenkins job",
        },
        buildNumber: {
          type: "number",
          description: "Build number",
        },
      },
      required: ["jobName", "buildNumber"],
    },
  },
  {
    name: "jenkins_get_artifact",
    description:
      "Download a specific artifact from a build (returns base64-encoded content)",
    inputSchema: {
      type: "object",
      properties: {
        jobName: {
          type: "string",
          description: "Name of the Jenkins job",
        },
        buildNumber: {
          type: "number",
          description: "Build number",
        },
        relativePath: {
          type: "string",
          description: 'Relative path to the artifact (e.g., "dist/app.jar")',
        },
      },
      required: ["jobName", "buildNumber", "relativePath"],
    },
  },
  {
    name: "jenkins_stop_build",
    description: "Stop/abort a running build",
    inputSchema: {
      type: "object",
      properties: {
        jobName: {
          type: "string",
          description: "Name of the Jenkins job",
        },
        buildNumber: {
          type: "number",
          description: "Build number to stop",
        },
      },
      required: ["jobName", "buildNumber"],
    },
  },
  {
    name: "jenkins_delete_build",
    description: "Delete a specific build",
    inputSchema: {
      type: "object",
      properties: {
        jobName: {
          type: "string",
          description: "Name of the Jenkins job",
        },
        buildNumber: {
          type: "number",
          description: "Build number to delete",
        },
      },
      required: ["jobName", "buildNumber"],
    },
  },
  {
    name: "jenkins_get_test_results",
    description: "Get test results for a build (pass/fail counts, test suites)",
    inputSchema: {
      type: "object",
      properties: {
        jobName: {
          type: "string",
          description: "Name of the Jenkins job",
        },
        buildNumber: {
          type: "number",
          description: "Build number",
        },
      },
      required: ["jobName", "buildNumber"],
    },
  },
  {
    name: "jenkins_get_build_changes",
    description: "Get Git commits/changes for a build",
    inputSchema: {
      type: "object",
      properties: {
        jobName: {
          type: "string",
          description: "Name of the Jenkins job",
        },
        buildNumber: {
          type: "number",
          description: "Build number",
        },
      },
      required: ["jobName", "buildNumber"],
    },
  },
  {
    name: "jenkins_get_pipeline_stages",
    description: "Get pipeline stages and their status for a build",
    inputSchema: {
      type: "object",
      properties: {
        jobName: {
          type: "string",
          description: "Name of the Jenkins job",
        },
        buildNumber: {
          type: "number",
          description: "Build number",
        },
      },
      required: ["jobName", "buildNumber"],
    },
  },
  {
    name: "jenkins_replay_build",
    description:
      "Replay/rerun a pipeline build, optionally with a modified pipeline script",
    inputSchema: {
      type: "object",
      properties: {
        jobName: {
          type: "string",
          description: "Name of the Jenkins job",
        },
        buildNumber: {
          type: "number",
          description: "Build number to replay",
        },
        mainScript: {
          type: "string",
          description:
            "Optional Groovy pipeline script to use instead of the original. When omitted, the original build script is replayed unchanged.",
        },
      },
      required: ["jobName", "buildNumber"],
    },
  },
  {
    name: "jenkins_get_queue",
    description: "Get the current build queue showing pending builds",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "jenkins_cancel_queue",
    description: "Cancel a queued build by queue ID",
    inputSchema: {
      type: "object",
      properties: {
        queueId: {
          type: "number",
          description: "Queue item ID to cancel",
        },
      },
      required: ["queueId"],
    },
  },
  {
    name: "jenkins_enable_job",
    description: "Enable a disabled job",
    inputSchema: {
      type: "object",
      properties: {
        jobName: {
          type: "string",
          description: "Name of the Jenkins job",
        },
      },
      required: ["jobName"],
    },
  },
  {
    name: "jenkins_disable_job",
    description: "Disable a job to prevent it from running",
    inputSchema: {
      type: "object",
      properties: {
        jobName: {
          type: "string",
          description: "Name of the Jenkins job",
        },
      },
      required: ["jobName"],
    },
  },
  {
    name: "jenkins_delete_job",
    description: "Permanently delete a job (WARNING: cannot be undone)",
    inputSchema: {
      type: "object",
      properties: {
        jobName: {
          type: "string",
          description: "Name of the Jenkins job",
        },
      },
      required: ["jobName"],
    },
  },
  {
    name: "jenkins_get_job_config",
    description: "Get job configuration XML",
    inputSchema: {
      type: "object",
      properties: {
        jobName: {
          type: "string",
          description: "Name of the Jenkins job",
        },
      },
      required: ["jobName"],
    },
  },
  {
    name: "jenkins_list_nodes",
    description: "List all Jenkins nodes/agents and their status",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "jenkins_get_system_info",
    description: "Get Jenkins system information",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "jenkins_get_version",
    description: "Get Jenkins version",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "jenkins_get_plugins",
    description: "List all installed Jenkins plugins",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "jenkins_create_job",
    description: "Create a new Jenkins job from an XML configuration",
    inputSchema: {
      type: "object",
      properties: {
        jobName: { type: "string", description: "Name for the new job" },
        configXml: {
          type: "string",
          description: "Jenkins job XML configuration",
        },
      },
      required: ["jobName", "configXml"],
    },
  },
  {
    name: "jenkins_update_job_config",
    description: "Update an existing job's XML configuration",
    inputSchema: {
      type: "object",
      properties: {
        jobName: { type: "string", description: "Name of the Jenkins job" },
        configXml: {
          type: "string",
          description: "New Jenkins job XML configuration",
        },
      },
      required: ["jobName", "configXml"],
    },
  },
  {
    name: "jenkins_rename_job",
    description: "Rename a Jenkins job",
    inputSchema: {
      type: "object",
      properties: {
        jobName: { type: "string", description: "Current job name" },
        newName: { type: "string", description: "New job name" },
      },
      required: ["jobName", "newName"],
    },
  },
  {
    name: "jenkins_copy_job",
    description: "Copy/duplicate a Jenkins job under a new name",
    inputSchema: {
      type: "object",
      properties: {
        fromName: {
          type: "string",
          description: "Source job name to copy from",
        },
        newName: { type: "string", description: "Name for the new job copy" },
      },
      required: ["fromName", "newName"],
    },
  },
  {
    name: "jenkins_get_node",
    description: "Get detailed information about a specific Jenkins node/agent",
    inputSchema: {
      type: "object",
      properties: {
        nodeName: {
          type: "string",
          description:
            "Node/agent name (use 'master' or 'Built-In Node' for the controller)",
        },
      },
      required: ["nodeName"],
    },
  },
  {
    name: "jenkins_toggle_node_offline",
    description: "Toggle a Jenkins node/agent between online and offline",
    inputSchema: {
      type: "object",
      properties: {
        nodeName: { type: "string", description: "Node/agent name" },
        offlineMessage: {
          type: "string",
          description: "Optional reason for taking the node offline",
        },
      },
      required: ["nodeName"],
    },
  },
  {
    name: "jenkins_list_views",
    description: "List all Jenkins views with their jobs",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "jenkins_get_view",
    description: "Get details and job list for a specific Jenkins view",
    inputSchema: {
      type: "object",
      properties: {
        viewName: { type: "string", description: "Name of the Jenkins view" },
      },
      required: ["viewName"],
    },
  },
  {
    name: "jenkins_quiet_down",
    description:
      "Put Jenkins into quiet mode — no new builds will start until cancelled (requires confirm: true)",
    inputSchema: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Optional reason for quiet mode",
        },
        confirm: {
          type: "boolean",
          description: "Must be true to proceed",
          default: false,
        },
      },
      required: ["confirm"],
    },
  },
  {
    name: "jenkins_cancel_quiet_down",
    description: "Cancel Jenkins quiet mode and resume accepting new builds",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "jenkins_safe_restart",
    description:
      "Safely restart Jenkins — waits for running builds to finish before restarting (requires confirm: true)",
    inputSchema: {
      type: "object",
      properties: {
        confirm: {
          type: "boolean",
          description: "Must be true to proceed",
          default: false,
        },
      },
      required: ["confirm"],
    },
  },
]

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
  -h, --help             Show this help message

Authentication:
  Either provide --bearer-token OR both --user and --api-token

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
    const authHeader = env.JENKINS_BEARER_TOKEN
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
      authType: env.JENKINS_BEARER_TOKEN ? "bearer" : "basic",
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

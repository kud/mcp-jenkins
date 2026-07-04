import { Tool } from "@modelcontextprotocol/sdk/types.js"

// Tool definitions and MCP annotation presets — pure data, no side effects (safe to import in tests).
// Shared annotation presets
export const READ_ONLY = { readOnlyHint: true,  destructiveHint: false, idempotentHint: true  } as const
export const WRITE     = { readOnlyHint: false, destructiveHint: false, idempotentHint: false } as const
export const DESTRUCT  = { readOnlyHint: false, destructiveHint: true,  idempotentHint: false } as const

// Tool definitions with proper MCP schema
export const rawTools: Tool[] = [
  {
    name: "jenkins_list_instances",
    description:
      "List all configured Jenkins instances with their names and URLs",
    inputSchema: { type: "object", properties: {}, required: [] },
    annotations: READ_ONLY,
  },
  {
    name: "jenkins_list_jobs",
    description: "List all Jenkins jobs with their names and URLs",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    annotations: READ_ONLY,
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
    annotations: READ_ONLY,
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
    annotations: READ_ONLY,
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
    annotations: READ_ONLY,
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
    annotations: READ_ONLY,
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
    annotations: READ_ONLY,
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
    annotations: READ_ONLY,
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
    annotations: WRITE,
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
    annotations: READ_ONLY,
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
    annotations: READ_ONLY,
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
    annotations: DESTRUCT,
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
    annotations: DESTRUCT,
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
    annotations: READ_ONLY,
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
    annotations: READ_ONLY,
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
    annotations: READ_ONLY,
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
    annotations: WRITE,
  },
  {
    name: "jenkins_get_queue",
    description: "Get the current build queue showing pending builds",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    annotations: READ_ONLY,
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
    annotations: DESTRUCT,
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
    annotations: WRITE,
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
    annotations: DESTRUCT,
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
    annotations: DESTRUCT,
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
    annotations: READ_ONLY,
  },
  {
    name: "jenkins_list_nodes",
    description: "List all Jenkins nodes/agents and their status",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    annotations: READ_ONLY,
  },
  {
    name: "jenkins_get_system_info",
    description: "Get Jenkins system information",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    annotations: READ_ONLY,
  },
  {
    name: "jenkins_get_version",
    description: "Get Jenkins version",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    annotations: READ_ONLY,
  },
  {
    name: "jenkins_get_plugins",
    description: "List all installed Jenkins plugins",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    annotations: READ_ONLY,
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
    annotations: WRITE,
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
    annotations: DESTRUCT,
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
    annotations: DESTRUCT,
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
    annotations: WRITE,
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
    annotations: READ_ONLY,
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
    annotations: DESTRUCT,
  },
  {
    name: "jenkins_list_views",
    description: "List all Jenkins views with their jobs",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    annotations: READ_ONLY,
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
    annotations: READ_ONLY,
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
    annotations: DESTRUCT,
  },
  {
    name: "jenkins_cancel_quiet_down",
    description: "Cancel Jenkins quiet mode and resume accepting new builds",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    annotations: WRITE,
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
    annotations: DESTRUCT,
  },
]

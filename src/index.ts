#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import { logger, errorResponse, McpError } from './common/index.js';
import { JenkinsClient } from './lib/jenkins-client.js';
import { getJobStatus } from './tools/get-job-status.js';
import { getBuildStatus } from './tools/get-build-status.js';
import { getConsoleLog } from './tools/get-console-log.js';
import { triggerBuild } from './tools/trigger-build.js';
import { listJobs } from './tools/list-jobs.js';
import { getRecentBuilds } from './tools/get-recent-builds.js';
import { listArtifacts } from './tools/list-artifacts.js';
import { getArtifact } from './tools/get-artifact.js';
import { searchJobs } from './tools/search-jobs.js';
import { stopBuild } from './tools/stop-build.js';
import { deleteBuild } from './tools/delete-build.js';
import { getTestResults } from './tools/get-test-results.js';
import { getQueue } from './tools/get-queue.js';
import { cancelQueue } from './tools/cancel-queue.js';
import { enableJob } from './tools/enable-job.js';
import { disableJob } from './tools/disable-job.js';
import { deleteJob } from './tools/delete-job.js';
import { getJobConfig } from './tools/get-job-config.js';
import { listNodes } from './tools/list-nodes.js';
import { getSystemInfo } from './tools/get-system-info.js';
import { getVersion } from './tools/get-version.js';
import { getPlugins } from './tools/get-plugins.js';
import { getBuildChanges } from './tools/get-build-changes.js';
import { getPipelineStages } from './tools/get-pipeline-stages.js';
import { replayBuild } from './tools/replay-build.js';

// Tool definitions with proper MCP schema
const tools: Tool[] = [
  {
    name: 'jenkins_list_jobs',
    description: 'List all Jenkins jobs with their names and URLs',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'jenkins_search_jobs',
    description: 'Search for Jenkins jobs by name (case-insensitive substring match)',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query to filter jobs by name'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'jenkins_get_job_status',
    description: 'Get the status of the last build for a specific job',
    inputSchema: {
      type: 'object',
      properties: {
        jobName: {
          type: 'string',
          description: 'Name of the Jenkins job'
        }
      },
      required: ['jobName']
    }
  },
  {
    name: 'jenkins_get_build_status',
    description: 'Get detailed status of a specific build number for a job',
    inputSchema: {
      type: 'object',
      properties: {
        jobName: {
          type: 'string',
          description: 'Name of the Jenkins job'
        },
        buildNumber: {
          type: 'number',
          description: 'Build number to retrieve'
        }
      },
      required: ['jobName', 'buildNumber']
    }
  },
  {
    name: 'jenkins_get_recent_builds',
    description: 'Get recent builds for a job with their status and metadata',
    inputSchema: {
      type: 'object',
      properties: {
        jobName: {
          type: 'string',
          description: 'Name of the Jenkins job'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of builds to return (default: 5)',
          default: 5
        }
      },
      required: ['jobName']
    }
  },
  {
    name: 'jenkins_get_console_log',
    description: 'Get console log output from a build. Returns both a snippet and full log.',
    inputSchema: {
      type: 'object',
      properties: {
        jobName: {
          type: 'string',
          description: 'Name of the Jenkins job'
        },
        buildNumber: {
          type: 'number',
          description: 'Build number (optional, defaults to last build)'
        }
      },
      required: ['jobName']
    }
  },
  {
    name: 'jenkins_trigger_build',
    description: 'Trigger a new build for a job, optionally with parameters',
    inputSchema: {
      type: 'object',
      properties: {
        jobName: {
          type: 'string',
          description: 'Name of the Jenkins job to trigger'
        },
        params: {
          type: 'object',
          description: 'Optional build parameters as key-value pairs',
          additionalProperties: true
        }
      },
      required: ['jobName']
    }
  },
  {
    name: 'jenkins_list_artifacts',
    description: 'List all artifacts produced by a specific build',
    inputSchema: {
      type: 'object',
      properties: {
        jobName: {
          type: 'string',
          description: 'Name of the Jenkins job'
        },
        buildNumber: {
          type: 'number',
          description: 'Build number'
        }
      },
      required: ['jobName', 'buildNumber']
    }
  },
  {
    name: 'jenkins_get_artifact',
    description: 'Download a specific artifact from a build (returns base64-encoded content)',
    inputSchema: {
      type: 'object',
      properties: {
        jobName: {
          type: 'string',
          description: 'Name of the Jenkins job'
        },
        buildNumber: {
          type: 'number',
          description: 'Build number'
        },
        relativePath: {
          type: 'string',
          description: 'Relative path to the artifact (e.g., "dist/app.jar")'
        }
      },
      required: ['jobName', 'buildNumber', 'relativePath']
    }
  },
  {
    name: 'jenkins_stop_build',
    description: 'Stop/abort a running build',
    inputSchema: {
      type: 'object',
      properties: {
        jobName: {
          type: 'string',
          description: 'Name of the Jenkins job'
        },
        buildNumber: {
          type: 'number',
          description: 'Build number to stop'
        }
      },
      required: ['jobName', 'buildNumber']
    }
  },
  {
    name: 'jenkins_delete_build',
    description: 'Delete a specific build',
    inputSchema: {
      type: 'object',
      properties: {
        jobName: {
          type: 'string',
          description: 'Name of the Jenkins job'
        },
        buildNumber: {
          type: 'number',
          description: 'Build number to delete'
        }
      },
      required: ['jobName', 'buildNumber']
    }
  },
  {
    name: 'jenkins_get_test_results',
    description: 'Get test results for a build (pass/fail counts, test suites)',
    inputSchema: {
      type: 'object',
      properties: {
        jobName: {
          type: 'string',
          description: 'Name of the Jenkins job'
        },
        buildNumber: {
          type: 'number',
          description: 'Build number'
        }
      },
      required: ['jobName', 'buildNumber']
    }
  },
  {
    name: 'jenkins_get_build_changes',
    description: 'Get Git commits/changes for a build',
    inputSchema: {
      type: 'object',
      properties: {
        jobName: {
          type: 'string',
          description: 'Name of the Jenkins job'
        },
        buildNumber: {
          type: 'number',
          description: 'Build number'
        }
      },
      required: ['jobName', 'buildNumber']
    }
  },
  {
    name: 'jenkins_get_pipeline_stages',
    description: 'Get pipeline stages and their status for a build',
    inputSchema: {
      type: 'object',
      properties: {
        jobName: {
          type: 'string',
          description: 'Name of the Jenkins job'
        },
        buildNumber: {
          type: 'number',
          description: 'Build number'
        }
      },
      required: ['jobName', 'buildNumber']
    }
  },
  {
    name: 'jenkins_replay_build',
    description: 'Replay/rerun a pipeline build with the same parameters',
    inputSchema: {
      type: 'object',
      properties: {
        jobName: {
          type: 'string',
          description: 'Name of the Jenkins job'
        },
        buildNumber: {
          type: 'number',
          description: 'Build number to replay'
        }
      },
      required: ['jobName', 'buildNumber']
    }
  },
  {
    name: 'jenkins_get_queue',
    description: 'Get the current build queue showing pending builds',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'jenkins_cancel_queue',
    description: 'Cancel a queued build by queue ID',
    inputSchema: {
      type: 'object',
      properties: {
        queueId: {
          type: 'number',
          description: 'Queue item ID to cancel'
        }
      },
      required: ['queueId']
    }
  },
  {
    name: 'jenkins_enable_job',
    description: 'Enable a disabled job',
    inputSchema: {
      type: 'object',
      properties: {
        jobName: {
          type: 'string',
          description: 'Name of the Jenkins job'
        }
      },
      required: ['jobName']
    }
  },
  {
    name: 'jenkins_disable_job',
    description: 'Disable a job to prevent it from running',
    inputSchema: {
      type: 'object',
      properties: {
        jobName: {
          type: 'string',
          description: 'Name of the Jenkins job'
        }
      },
      required: ['jobName']
    }
  },
  {
    name: 'jenkins_delete_job',
    description: 'Permanently delete a job (WARNING: cannot be undone)',
    inputSchema: {
      type: 'object',
      properties: {
        jobName: {
          type: 'string',
          description: 'Name of the Jenkins job'
        }
      },
      required: ['jobName']
    }
  },
  {
    name: 'jenkins_get_job_config',
    description: 'Get job configuration XML',
    inputSchema: {
      type: 'object',
      properties: {
        jobName: {
          type: 'string',
          description: 'Name of the Jenkins job'
        }
      },
      required: ['jobName']
    }
  },
  {
    name: 'jenkins_list_nodes',
    description: 'List all Jenkins nodes/agents and their status',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'jenkins_get_system_info',
    description: 'Get Jenkins system information',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'jenkins_get_version',
    description: 'Get Jenkins version',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'jenkins_get_plugins',
    description: 'List all installed Jenkins plugins',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];

// Map tool names to handler functions
type ToolHandler = (client: JenkinsClient, input: any) => Promise<any>;
const toolHandlers: Record<string, ToolHandler> = {
  'jenkins_list_jobs': listJobs,
  'jenkins_search_jobs': searchJobs,
  'jenkins_get_job_status': getJobStatus,
  'jenkins_get_build_status': getBuildStatus,
  'jenkins_get_recent_builds': getRecentBuilds,
  'jenkins_get_console_log': getConsoleLog,
  'jenkins_trigger_build': triggerBuild,
  'jenkins_list_artifacts': listArtifacts,
  'jenkins_get_artifact': getArtifact,
  'jenkins_stop_build': stopBuild,
  'jenkins_delete_build': deleteBuild,
  'jenkins_get_test_results': getTestResults,
  'jenkins_get_build_changes': getBuildChanges,
  'jenkins_get_pipeline_stages': getPipelineStages,
  'jenkins_replay_build': replayBuild,
  'jenkins_get_queue': getQueue,
  'jenkins_cancel_queue': cancelQueue,
  'jenkins_enable_job': enableJob,
  'jenkins_disable_job': disableJob,
  'jenkins_delete_job': deleteJob,
  'jenkins_get_job_config': getJobConfig,
  'jenkins_list_nodes': listNodes,
  'jenkins_get_system_info': getSystemInfo,
  'jenkins_get_version': getVersion,
  'jenkins_get_plugins': getPlugins
};

// Create MCP server instance
const server = new Server(
  {
    name: 'jenkins-mcp-server',
    version: '0.1.0'
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

// Create Jenkins client (uses environment variables)
let client: JenkinsClient;
try {
  client = new JenkinsClient();
  logger.info('Jenkins client initialized', {
    url: process.env.JENKINS_URL,
    authType: process.env.JENKINS_BEARER_TOKEN ? 'bearer' : 'basic'
  });
} catch (error: any) {
  logger.error('Failed to initialize Jenkins client', { error: error.message });
  process.exit(1);
}

// Handle tool list requests
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool execution requests
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const handler = toolHandlers[name];
    if (!handler) {
      throw new McpError('TOOL_NOT_FOUND', `Unknown tool: ${name}`, 404);
    }

    const result = await handler(client, args || {});

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  } catch (error: any) {
    logger.error('Tool execution failed', {
      tool: name,
      error: error.message,
      code: error.code
    });

    if (error instanceof McpError) {
      throw error;
    }

    throw new McpError('EXECUTION_ERROR', error.message || 'Tool execution failed', 500);
  }
});

// Start the server with stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('Jenkins MCP server running on stdio');
}

main().catch((error) => {
  logger.error('Fatal server error', { error: String(error) });
  process.exit(1);
});

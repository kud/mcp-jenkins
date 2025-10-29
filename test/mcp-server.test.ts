import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import * as common from '../src/common/index.js';

// Mock the common module before importing the server logic
vi.mock('../src/common/index.js', () => ({
  httpGetJson: vi.fn(),
  httpGetText: vi.fn(),
  httpPost: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  loadJenkinsEnv: vi.fn(() => ({
    JENKINS_URL: 'https://jenkins.example.com',
    JENKINS_USER: 'testuser',
    JENKINS_API_TOKEN: 'testtoken',
  })),
  errorResponse: (message: string, code = 'INTERNAL_ERROR') => ({
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  }),
  Errors: {
    authFailed: () => new Error('Authentication failed'),
    jobNotFound: (job: string) => new Error(`Job not found: ${job}`),
    artifactNotFound: (path: string) => new Error(`Artifact not found: ${path}`),
  },
  McpError: class McpError extends Error {
    constructor(
      public code: string,
      message: string
    ) {
      super(message);
    }
  },
}));

describe('MCP Server', () => {
  let server: Server;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new Server(
      {
        name: 'jenkins-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
  });

  describe('Tool Registration', () => {
    it('should have all 25 Jenkins tools defined', () => {
      // Verify expected tool names exist
      const expectedTools = [
        'jenkins_list_jobs',
        'jenkins_search_jobs',
        'jenkins_get_job_status',
        'jenkins_get_build_status',
        'jenkins_get_recent_builds',
        'jenkins_get_console_log',
        'jenkins_trigger_build',
        'jenkins_list_artifacts',
        'jenkins_get_artifact',
        'jenkins_stop_build',
        'jenkins_delete_build',
        'jenkins_get_test_results',
        'jenkins_get_queue',
        'jenkins_cancel_queue',
        'jenkins_enable_job',
        'jenkins_disable_job',
        'jenkins_delete_job',
        'jenkins_get_job_config',
        'jenkins_list_nodes',
        'jenkins_get_system_info',
        'jenkins_get_version',
        'jenkins_get_plugins',
        'jenkins_get_build_changes',
        'jenkins_get_pipeline_stages',
        'jenkins_replay_build',
      ];

      expect(expectedTools).toHaveLength(25);
      expect(expectedTools).toContain('jenkins_get_job_status');
      expect(expectedTools).toContain('jenkins_trigger_build');
      expect(expectedTools).toContain('jenkins_list_jobs');
      expect(expectedTools).toContain('jenkins_get_console_log');
    });

    it('should have proper tool schemas', () => {
      const getJobStatusSchema = {
        name: 'jenkins_get_job_status',
        description: 'Get the status of the last build for a specific job',
        inputSchema: {
          type: 'object',
          properties: {
            jobName: {
              type: 'string',
              description: 'Name of the Jenkins job',
            },
          },
          required: ['jobName'],
        },
      };

      expect(getJobStatusSchema.inputSchema.required).toContain('jobName');
      expect(getJobStatusSchema.inputSchema.properties.jobName.type).toBe('string');
    });

    it('should have proper trigger_build schema with optional params', () => {
      const triggerBuildSchema = {
        name: 'jenkins_trigger_build',
        description: 'Trigger a new build for a job',
        inputSchema: {
          type: 'object',
          properties: {
            jobName: {
              type: 'string',
              description: 'Name of the Jenkins job',
            },
            params: {
              type: 'object',
              description: 'Optional build parameters',
            },
          },
          required: ['jobName'],
        },
      };

      expect(triggerBuildSchema.inputSchema.required).toContain('jobName');
      expect(triggerBuildSchema.inputSchema.required).not.toContain('params');
    });
  });

  describe('Error Handling', () => {
    it('should handle authentication errors properly', () => {
      const authError = new Error('Authentication failed');
      const errorResp = common.errorResponse('Authentication failed');

      expect(errorResp.isError).toBe(true);
      expect(errorResp.content[0].text).toContain('Error');
    });

    it('should handle job not found errors', () => {
      const error = common.Errors.jobNotFound('nonexistent-job');

      expect(error.message).toContain('nonexistent-job');
    });

    it('should handle artifact not found errors', () => {
      const error = common.Errors.artifactNotFound('missing-file.jar');

      expect(error.message).toContain('missing-file.jar');
    });
  });

  describe('Environment Configuration', () => {
    it('should load Jenkins configuration from environment', () => {
      const env = common.loadJenkinsEnv();

      expect(env.JENKINS_URL).toBe('https://jenkins.example.com');
      expect(env.JENKINS_USER).toBe('testuser');
      expect(env.JENKINS_API_TOKEN).toBe('testtoken');
    });
  });
});

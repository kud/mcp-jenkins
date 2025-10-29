import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JenkinsClient } from '../../src/lib/jenkins-client.js';
import * as common from '../../src/common/index.js';

// Mock the common module
vi.mock('../../src/common/index.js', () => ({
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
  Errors: {
    authFailed: () => new Error('Authentication failed'),
    jobNotFound: (job: string) => new Error(`Job not found: ${job}`),
    artifactNotFound: (path: string) => new Error(`Artifact not found: ${path}`),
  },
}));

describe('JenkinsClient', () => {
  let client: JenkinsClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new JenkinsClient();
  });

  describe('constructor', () => {
    it('should use environment variables when no credentials provided', () => {
      const client = new JenkinsClient();
      expect(common.loadJenkinsEnv).toHaveBeenCalled();
    });

    it('should use provided credentials over environment', () => {
      const creds = {
        baseUrl: 'https://custom.jenkins.com',
        authHeader: 'Bearer custom-token',
      };
      const client = new JenkinsClient(creds);
      // Client should not load env when credentials are provided
      expect(client).toBeDefined();
    });
  });

  describe('listJobs', () => {
    it('should return list of jobs', async () => {
      const mockResponse = {
        jobs: [
          { name: 'job-1', url: 'https://jenkins.example.com/job/job-1' },
          { name: 'job-2', url: 'https://jenkins.example.com/job/job-2' },
        ],
      };
      vi.mocked(common.httpGetJson).mockResolvedValue(mockResponse);

      const jobs = await client.listJobs();

      expect(jobs).toEqual([
        { name: 'job-1', url: 'https://jenkins.example.com/job/job-1' },
        { name: 'job-2', url: 'https://jenkins.example.com/job/job-2' },
      ]);
      expect(common.httpGetJson).toHaveBeenCalledWith(
        'https://jenkins.example.com/api/json',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: expect.any(String) }),
        })
      );
    });

    it('should return empty array when no jobs', async () => {
      vi.mocked(common.httpGetJson).mockResolvedValue({ jobs: null });

      const jobs = await client.listJobs();

      expect(jobs).toEqual([]);
    });

    it('should throw auth error on 401', async () => {
      vi.mocked(common.httpGetJson).mockRejectedValue(new Error('HTTP 401'));

      await expect(client.listJobs()).rejects.toThrow('Authentication failed');
    });
  });

  describe('getRecentBuilds', () => {
    it('should return recent builds with normalized data', async () => {
      const mockResponse = {
        builds: [
          {
            number: 100,
            result: 'SUCCESS',
            duration: 5000,
            timestamp: 1698768000000,
            url: 'https://jenkins.example.com/job/test-job/100/',
            building: false,
          },
          {
            number: 99,
            result: 'FAILURE',
            duration: 3000,
            timestamp: 1698764400000,
            url: 'https://jenkins.example.com/job/test-job/99/',
            building: false,
          },
        ],
      };
      vi.mocked(common.httpGetJson).mockResolvedValue(mockResponse);

      const builds = await client.getRecentBuilds('test-job', 2);

      expect(builds).toHaveLength(2);
      expect(builds[0]).toMatchObject({
        id: '100',
        result: 'SUCCESS',
        durationMs: 5000,
      });
      expect(builds[1]).toMatchObject({
        id: '99',
        result: 'FAILURE',
        durationMs: 3000,
      });
    });

    it('should mark building jobs as RUNNING', async () => {
      const mockResponse = {
        builds: [
          {
            number: 101,
            building: true,
            duration: 0,
            timestamp: Date.now(),
            url: 'https://jenkins.example.com/job/test-job/101/',
          },
        ],
      };
      vi.mocked(common.httpGetJson).mockResolvedValue(mockResponse);

      const builds = await client.getRecentBuilds('test-job', 1);

      expect(builds[0].result).toBe('RUNNING');
    });

    it('should throw job not found error on 404', async () => {
      vi.mocked(common.httpGetJson).mockRejectedValue(new Error('HTTP 404'));

      await expect(client.getRecentBuilds('nonexistent-job')).rejects.toThrow(
        'Job not found: nonexistent-job'
      );
    });
  });

  describe('getLastBuild', () => {
    it('should return last build normalized', async () => {
      const mockResponse = {
        number: 42,
        result: 'SUCCESS',
        duration: 10000,
        timestamp: 1698768000000,
        url: 'https://jenkins.example.com/job/my-job/42/',
        building: false,
      };
      vi.mocked(common.httpGetJson).mockResolvedValue(mockResponse);

      const build = await client.getLastBuild('my-job');

      expect(build).toMatchObject({
        id: '42',
        result: 'SUCCESS',
        durationMs: 10000,
      });
    });
  });

  describe('getBuild', () => {
    it('should return specific build', async () => {
      const mockResponse = {
        number: 55,
        result: 'ABORTED',
        duration: 2000,
        timestamp: 1698768000000,
        url: 'https://jenkins.example.com/job/my-job/55/',
        building: false,
      };
      vi.mocked(common.httpGetJson).mockResolvedValue(mockResponse);

      const build = await client.getBuild('my-job', 55);

      expect(build.id).toBe('55');
      expect(build.result).toBe('ABORTED');
    });
  });

  describe('getConsoleLog', () => {
    it('should return console log with snippet', async () => {
      const fullLog = 'Line 1\nLine 2\nLine 3\nLine 4\n'.repeat(10);
      vi.mocked(common.httpGetText).mockResolvedValue(fullLog);
      vi.mocked(common.httpGetJson).mockResolvedValue({
        number: 10,
        building: false,
      });

      const result = await client.getConsoleLog('my-job', 10, 50);

      expect(result.jobName).toBe('my-job');
      expect(result.buildNumber).toBe(10);
      expect(result.logSnippet).toHaveLength(50);
      expect(result.fullLog).toBe(fullLog);
    });

    it('should fetch last build when buildNumber not provided', async () => {
      const fullLog = 'Console output';
      vi.mocked(common.httpGetJson).mockResolvedValue({
        number: 15,
        building: false,
      });
      vi.mocked(common.httpGetText).mockResolvedValue(fullLog);

      const result = await client.getConsoleLog('my-job');

      expect(result.buildNumber).toBe(15);
    });
  });

  describe('triggerBuild', () => {
    it('should trigger build without parameters', async () => {
      const mockCrumb = { crumbRequestField: 'Jenkins-Crumb', crumb: 'abc123' };
      vi.mocked(common.httpGetJson).mockResolvedValue(mockCrumb);
      vi.mocked(common.httpPost).mockResolvedValue({
        headers: { location: 'https://jenkins.example.com/queue/item/123/' },
      });

      const result = await client.triggerBuild('my-job');

      expect(result.jobName).toBe('my-job');
      expect(result.queueUrl).toBe('https://jenkins.example.com/queue/item/123/');
      expect(common.httpPost).toHaveBeenCalledWith(
        'https://jenkins.example.com/job/my-job/build',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Jenkins-Crumb': 'abc123',
          }),
        })
      );
    });

    it('should trigger build with parameters', async () => {
      const mockCrumb = { crumbRequestField: 'Jenkins-Crumb', crumb: 'xyz789' };
      vi.mocked(common.httpGetJson).mockResolvedValue(mockCrumb);
      vi.mocked(common.httpPost).mockResolvedValue({
        headers: { location: 'https://jenkins.example.com/queue/item/456/' },
      });

      const result = await client.triggerBuild('my-job', { branch: 'main', tag: 'v1.0' });

      expect(common.httpPost).toHaveBeenCalledWith(
        'https://jenkins.example.com/job/my-job/buildWithParameters',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
          body: expect.stringContaining('branch=main'),
        })
      );
    });
  });

  describe('listArtifacts', () => {
    it('should list build artifacts', async () => {
      const mockResponse = {
        artifacts: [
          { fileName: 'app.jar', relativePath: 'build/app.jar' },
          { fileName: 'test-results.xml', relativePath: 'build/test-results.xml' },
        ],
      };
      vi.mocked(common.httpGetJson).mockResolvedValue(mockResponse);

      const artifacts = await client.listArtifacts('my-job', 100);

      expect(artifacts).toHaveLength(2);
      expect(artifacts[0]).toMatchObject({
        fileName: 'app.jar',
        relativePath: 'build/app.jar',
        url: expect.stringContaining('artifact/build/app.jar'),
      });
    });

    it('should return empty array when no artifacts', async () => {
      vi.mocked(common.httpGetJson).mockResolvedValue({ artifacts: null });

      const artifacts = await client.listArtifacts('my-job', 100);

      expect(artifacts).toEqual([]);
    });
  });

  describe('searchJobs', () => {
    it('should filter jobs by query', async () => {
      const mockResponse = {
        jobs: [
          { name: 'frontend-build', url: 'url1' },
          { name: 'backend-build', url: 'url2' },
          { name: 'frontend-test', url: 'url3' },
        ],
      };
      vi.mocked(common.httpGetJson).mockResolvedValue(mockResponse);

      const results = await client.searchJobs('frontend');

      expect(results).toHaveLength(2);
      expect(results.map((j) => j.name)).toEqual(['frontend-build', 'frontend-test']);
    });

    it('should return empty array for empty query', async () => {
      const results = await client.searchJobs('   ');

      expect(results).toEqual([]);
    });
  });

  describe('stopBuild', () => {
    it('should stop a running build', async () => {
      const mockCrumb = { crumbRequestField: 'Jenkins-Crumb', crumb: 'stop123' };
      vi.mocked(common.httpGetJson).mockResolvedValue(mockCrumb);
      vi.mocked(common.httpPost).mockResolvedValue({ headers: {} });

      const result = await client.stopBuild('my-job', 50);

      expect(result).toEqual({ jobName: 'my-job', buildNumber: 50, stopped: true });
      expect(common.httpPost).toHaveBeenCalledWith(
        'https://jenkins.example.com/job/my-job/50/stop',
        expect.anything()
      );
    });
  });

  describe('getTestResults', () => {
    it('should return test results', async () => {
      const mockResponse = {
        totalCount: 100,
        passCount: 95,
        failCount: 3,
        skipCount: 2,
        duration: 45.5,
        suites: [{ name: 'Suite1' }],
      };
      vi.mocked(common.httpGetJson).mockResolvedValue(mockResponse);

      const result = await client.getTestResults('my-job', 10);

      expect(result.totalTests).toBe(100);
      expect(result.passedTests).toBe(95);
      expect(result.failedTests).toBe(3);
      expect(result.skippedTests).toBe(2);
    });

    it('should handle missing test results', async () => {
      vi.mocked(common.httpGetJson).mockRejectedValue(new Error('HTTP 404'));

      const result = await client.getTestResults('my-job', 10);

      expect(result.message).toContain('No test results found');
      expect(result.totalTests).toBe(0);
    });
  });

  describe('getQueue', () => {
    it('should return build queue', async () => {
      const mockResponse = {
        items: [
          {
            id: 123,
            blocked: false,
            buildable: true,
            stuck: false,
            why: 'Waiting for executor',
            task: { name: 'my-job', url: 'url1' },
            inQueueSince: 1698768000000,
          },
        ],
      };
      vi.mocked(common.httpGetJson).mockResolvedValue(mockResponse);

      const queue = await client.getQueue();

      expect(queue).toHaveLength(1);
      expect(queue[0].id).toBe(123);
      expect(queue[0].why).toBe('Waiting for executor');
    });
  });

  describe('getSystemInfo', () => {
    it('should return Jenkins system info', async () => {
      const mockResponse = {
        nodeDescription: 'Jenkins Controller',
        nodeName: 'master',
        numExecutors: 4,
        mode: 'NORMAL',
        quietingDown: false,
        useCrumbs: true,
        useSecurity: true,
      };
      vi.mocked(common.httpGetJson).mockResolvedValue(mockResponse);

      const info = await client.getSystemInfo();

      expect(info.nodeDescription).toBe('Jenkins Controller');
      expect(info.numExecutors).toBe(4);
      expect(info.useSecurity).toBe(true);
    });
  });
});

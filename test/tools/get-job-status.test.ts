import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getJobStatus } from '../../src/tools/get-job-status.js';
import { JenkinsClient } from '../../src/lib/jenkins-client.js';

describe('getJobStatus tool', () => {
  let mockClient: JenkinsClient;

  beforeEach(() => {
    mockClient = {
      getLastBuild: vi.fn(),
    } as any;
  });

  it('should return last build status for a job', async () => {
    const mockBuild = {
      id: '123',
      result: 'SUCCESS',
      durationMs: 5000,
      timestamp: '2024-10-29T10:00:00.000Z',
      url: 'https://jenkins.example.com/job/test-job/123/',
    };

    vi.mocked(mockClient.getLastBuild).mockResolvedValue(mockBuild);

    const result = await getJobStatus(mockClient, { jobName: 'test-job' });

    expect(mockClient.getLastBuild).toHaveBeenCalledWith('test-job');
    expect(result).toEqual(mockBuild);
  });

  it('should propagate errors from client', async () => {
    vi.mocked(mockClient.getLastBuild).mockRejectedValue(
      new Error('Job not found: test-job')
    );

    await expect(getJobStatus(mockClient, { jobName: 'test-job' })).rejects.toThrow(
      'Job not found: test-job'
    );
  });

  it('should handle RUNNING builds', async () => {
    const mockBuild = {
      id: '124',
      result: 'RUNNING',
      durationMs: 0,
      timestamp: '2024-10-29T10:05:00.000Z',
      url: 'https://jenkins.example.com/job/test-job/124/',
    };

    vi.mocked(mockClient.getLastBuild).mockResolvedValue(mockBuild);

    const result = await getJobStatus(mockClient, { jobName: 'test-job' });

    expect(result.result).toBe('RUNNING');
  });

  it('should handle FAILURE builds', async () => {
    const mockBuild = {
      id: '125',
      result: 'FAILURE',
      durationMs: 3000,
      timestamp: '2024-10-29T10:10:00.000Z',
      url: 'https://jenkins.example.com/job/test-job/125/',
    };

    vi.mocked(mockClient.getLastBuild).mockResolvedValue(mockBuild);

    const result = await getJobStatus(mockClient, { jobName: 'test-job' });

    expect(result.result).toBe('FAILURE');
    expect(result.durationMs).toBe(3000);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { triggerBuild } from '../../src/tools/trigger-build.js';
import { JenkinsClient } from '../../src/lib/jenkins-client.js';

describe('triggerBuild tool', () => {
  let mockClient: JenkinsClient;

  beforeEach(() => {
    mockClient = {
      triggerBuild: vi.fn(),
    } as any;
  });

  it('should trigger build without parameters', async () => {
    const mockResponse = {
      jobName: 'my-job',
      queueUrl: 'https://jenkins.example.com/queue/item/123/',
    };

    vi.mocked(mockClient.triggerBuild).mockResolvedValue(mockResponse);

    const result = await triggerBuild(mockClient, { jobName: 'my-job' });

    expect(mockClient.triggerBuild).toHaveBeenCalledWith('my-job', undefined);
    expect(result).toEqual(mockResponse);
  });

  it('should trigger build with parameters', async () => {
    const mockResponse = {
      jobName: 'my-job',
      queueUrl: 'https://jenkins.example.com/queue/item/456/',
    };

    const params = {
      branch: 'main',
      environment: 'production',
      tag: 'v1.2.3',
    };

    vi.mocked(mockClient.triggerBuild).mockResolvedValue(mockResponse);

    const result = await triggerBuild(mockClient, { jobName: 'my-job', params });

    expect(mockClient.triggerBuild).toHaveBeenCalledWith('my-job', params);
    expect(result).toEqual(mockResponse);
  });

  it('should trigger build with single parameter', async () => {
    const mockResponse = {
      jobName: 'deploy-job',
      queueUrl: 'https://jenkins.example.com/queue/item/789/',
    };

    const params = { version: '2.0.0' };

    vi.mocked(mockClient.triggerBuild).mockResolvedValue(mockResponse);

    const result = await triggerBuild(mockClient, { jobName: 'deploy-job', params });

    expect(mockClient.triggerBuild).toHaveBeenCalledWith('deploy-job', params);
    expect(result.queueUrl).toBe('https://jenkins.example.com/queue/item/789/');
  });

  it('should propagate errors from client', async () => {
    vi.mocked(mockClient.triggerBuild).mockRejectedValue(
      new Error('Job not found: nonexistent-job')
    );

    await expect(
      triggerBuild(mockClient, { jobName: 'nonexistent-job' })
    ).rejects.toThrow('Job not found: nonexistent-job');
  });

  it('should handle empty params object', async () => {
    const mockResponse = {
      jobName: 'my-job',
      queueUrl: 'https://jenkins.example.com/queue/item/999/',
    };

    vi.mocked(mockClient.triggerBuild).mockResolvedValue(mockResponse);

    const result = await triggerBuild(mockClient, { jobName: 'my-job', params: {} });

    expect(mockClient.triggerBuild).toHaveBeenCalledWith('my-job', {});
    expect(result).toEqual(mockResponse);
  });

  it('should handle null queueUrl response', async () => {
    const mockResponse = {
      jobName: 'my-job',
      queueUrl: null,
    };

    vi.mocked(mockClient.triggerBuild).mockResolvedValue(mockResponse);

    const result = await triggerBuild(mockClient, { jobName: 'my-job' });

    expect(result.queueUrl).toBeNull();
  });

  it('should handle complex parameter types', async () => {
    const mockResponse = {
      jobName: 'complex-job',
      queueUrl: 'https://jenkins.example.com/queue/item/111/',
    };

    const params = {
      string_param: 'value',
      number_param: 42,
      boolean_param: true,
      array_param: ['a', 'b', 'c'],
    };

    vi.mocked(mockClient.triggerBuild).mockResolvedValue(mockResponse);

    const result = await triggerBuild(mockClient, { jobName: 'complex-job', params });

    expect(mockClient.triggerBuild).toHaveBeenCalledWith('complex-job', params);
    expect(result).toEqual(mockResponse);
  });
});

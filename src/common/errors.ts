export class McpError extends Error {
  code: string;
  status?: number;
  constructor(code: string, message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export const Errors = {
  authFailed: () => new McpError('AUTH_FAILED', 'Authentication failed. Check credentials.', 401),
  jobNotFound: (job: string) => new McpError('JOB_NOT_FOUND', `Job not found: ${job}`, 404),
  timeout: () => new McpError('TIMEOUT', 'Jenkins request timed out.', 504),
  artifactNotFound: (path: string) => new McpError('ARTIFACT_NOT_FOUND', `Artifact not found: ${path}`, 404),
  unexpected: (message: string) => new McpError('UNEXPECTED', message, 500)
};

export const errorResponse = (err: unknown) => {
  if (err instanceof McpError) return { error: err.message, code: err.code };
  return { error: 'Unexpected error', code: 'UNEXPECTED' };
};

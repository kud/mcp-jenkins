import { JenkinsClient } from '../lib/jenkins-client.js';

export interface GetConsoleLogInput {
  jobName: string;
  buildNumber?: number;
  maxSnippetLength?: number;
  start?: number;
  maxBytes?: number;
  pattern?: string;
}
export const getConsoleLog = async (client: JenkinsClient, input: GetConsoleLogInput) => {
  return client.getConsoleLog(input.jobName, input.buildNumber, {
    maxSnippetLength: input.maxSnippetLength,
    start: input.start,
    maxBytes: input.maxBytes,
    pattern: input.pattern,
  });
};

import { JenkinsClient } from '../lib/jenkins-client.js';

export interface GetConsoleLogInput { jobName: string; buildNumber?: number; maxSnippetLength?: number }
export const getConsoleLog = async (client: JenkinsClient, input: GetConsoleLogInput) => {
  return client.getConsoleLog(input.jobName, input.buildNumber, input.maxSnippetLength);
};

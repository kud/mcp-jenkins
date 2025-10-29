import { JenkinsClient } from '../lib/jenkins-client.js';

export interface GetBuildStatusInput { jobName: string; buildNumber: number }
export const getBuildStatus = async (client: JenkinsClient, input: GetBuildStatusInput) => {
  return client.getBuild(input.jobName, input.buildNumber);
};

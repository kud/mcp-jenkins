import { JenkinsClient } from '../lib/jenkins-client.js';

export interface ListArtifactsInput { jobName: string; buildNumber: number }
export const listArtifacts = async (client: JenkinsClient, input: ListArtifactsInput) => {
  return client.listArtifacts(input.jobName, input.buildNumber);
};

import { JenkinsClient } from '../lib/jenkins-client.js';

export interface GetArtifactInput { jobName: string; buildNumber: number; relativePath: string }
export const getArtifact = async (client: JenkinsClient, input: GetArtifactInput) => {
  return client.getArtifact(input.jobName, input.buildNumber, input.relativePath);
};

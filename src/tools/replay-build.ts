import { JenkinsClient } from '../lib/jenkins-client.js';

export interface ReplayBuildInput {
  jobName: string;
  buildNumber: number;
}

export const replayBuild = async (client: JenkinsClient, input: ReplayBuildInput) => {
  return client.replayBuild(input.jobName, input.buildNumber);
};

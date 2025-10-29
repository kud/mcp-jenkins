import { JenkinsClient } from '../lib/jenkins-client.js';

export interface StopBuildInput {
  jobName: string;
  buildNumber: number;
}

export const stopBuild = async (client: JenkinsClient, input: StopBuildInput) => {
  return client.stopBuild(input.jobName, input.buildNumber);
};

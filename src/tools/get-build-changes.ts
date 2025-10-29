import { JenkinsClient } from '../lib/jenkins-client.js';

export interface GetBuildChangesInput {
  jobName: string;
  buildNumber: number;
}

export const getBuildChanges = async (client: JenkinsClient, input: GetBuildChangesInput) => {
  return client.getBuildChanges(input.jobName, input.buildNumber);
};

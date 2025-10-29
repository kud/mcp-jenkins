import { JenkinsClient } from '../lib/jenkins-client.js';

export interface DeleteBuildInput {
  jobName: string;
  buildNumber: number;
}

export const deleteBuild = async (client: JenkinsClient, input: DeleteBuildInput) => {
  return client.deleteBuild(input.jobName, input.buildNumber);
};

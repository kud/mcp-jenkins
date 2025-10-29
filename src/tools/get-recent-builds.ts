import { JenkinsClient, NormalizedBuild } from '../lib/jenkins-client.js';

export interface GetRecentBuildsInput { jobName: string; limit?: number }
export const getRecentBuilds = async (client: JenkinsClient, input: GetRecentBuildsInput): Promise<NormalizedBuild[]> => {
  return client.getRecentBuilds(input.jobName, input.limit ?? 5);
};

import { JenkinsClient } from '../lib/jenkins-client.js';

export interface GetJobStatusInput { jobName: string }
export const getJobStatus = async (client: JenkinsClient, input: GetJobStatusInput) => {
  const build = await client.getLastBuild(input.jobName);
  return build;
};

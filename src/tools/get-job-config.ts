import { JenkinsClient } from '../lib/jenkins-client.js';

export interface GetJobConfigInput {
  jobName: string;
}

export const getJobConfig = async (client: JenkinsClient, input: GetJobConfigInput) => {
  return client.getJobConfig(input.jobName);
};

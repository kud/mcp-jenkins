import { JenkinsClient } from '../lib/jenkins-client.js';

export interface EnableJobInput {
  jobName: string;
}

export const enableJob = async (client: JenkinsClient, input: EnableJobInput) => {
  return client.enableJob(input.jobName);
};

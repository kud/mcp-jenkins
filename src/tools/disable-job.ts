import { JenkinsClient } from '../lib/jenkins-client.js';

export interface DisableJobInput {
  jobName: string;
}

export const disableJob = async (client: JenkinsClient, input: DisableJobInput) => {
  return client.disableJob(input.jobName);
};

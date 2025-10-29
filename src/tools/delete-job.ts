import { JenkinsClient } from '../lib/jenkins-client.js';

export interface DeleteJobInput {
  jobName: string;
}

export const deleteJob = async (client: JenkinsClient, input: DeleteJobInput) => {
  return client.deleteJob(input.jobName);
};

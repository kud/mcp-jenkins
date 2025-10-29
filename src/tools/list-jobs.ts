import { JenkinsClient } from '../lib/jenkins-client.js';

export interface ListJobsInput { }
export const listJobs = async (client: JenkinsClient, _input: ListJobsInput) => {
  return client.listJobs();
};

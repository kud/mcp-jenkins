import {
  JenkinsClient,
  ListJobsOptions,
} from '../lib/jenkins-client.js';

export interface ListJobsInput extends ListJobsOptions { }
export const listJobs = async (client: JenkinsClient, input: ListJobsInput) => {
  return client.listJobs(input);
};

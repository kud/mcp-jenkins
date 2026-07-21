import {
  JenkinsClient,
  ListJobsOptions,
} from '../lib/jenkins-client.js';

export interface SearchJobsInput extends ListJobsOptions { query: string }
export const searchJobs = async (client: JenkinsClient, input: SearchJobsInput) => {
  const { query, ...options } = input;
  return client.searchJobs(query, options);
};

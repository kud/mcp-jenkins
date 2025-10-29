import { JenkinsClient } from '../lib/jenkins-client.js';

export interface SearchJobsInput { query: string }
export const searchJobs = async (client: JenkinsClient, input: SearchJobsInput) => {
  return client.searchJobs(input.query);
};

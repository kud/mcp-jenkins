import { JenkinsClient } from "../lib/client.js"
import { searchJobs as findJobs, ListJobsOptions } from "../lib/jobs.js"

export interface SearchJobsInput extends ListJobsOptions {
  query: string
}

export const searchJobs = async (
  client: JenkinsClient,
  input: SearchJobsInput,
) => {
  const { query, ...options } = input
  return findJobs(client, query, options)
}

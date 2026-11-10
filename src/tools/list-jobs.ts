import { JenkinsClient } from "../lib/client.js"
import { listJobs as readJobs, ListJobsOptions } from "../lib/jobs.js"

export interface ListJobsInput extends ListJobsOptions {}

export const listJobs = async (client: JenkinsClient, input: ListJobsInput) =>
  readJobs(client, input)

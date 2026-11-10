import { JenkinsClient } from "../lib/client.js"
import { getLastBuild } from "../lib/builds.js"

export interface GetJobStatusInput {
  jobName: string
}

export const getJobStatus = async (
  client: JenkinsClient,
  input: GetJobStatusInput,
) => getLastBuild(client, input.jobName)

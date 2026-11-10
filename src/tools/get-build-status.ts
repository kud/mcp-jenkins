import { JenkinsClient } from "../lib/client.js"
import { getBuild } from "../lib/builds.js"

export interface GetBuildStatusInput {
  jobName: string
  buildNumber: number
}

export const getBuildStatus = async (
  client: JenkinsClient,
  input: GetBuildStatusInput,
) => getBuild(client, input.jobName, input.buildNumber)

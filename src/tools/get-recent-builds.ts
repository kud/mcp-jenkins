import { JenkinsClient } from "../lib/client.js"
import { getRecentBuilds as readRecentBuilds, NormalizedBuild } from "../lib/builds.js"

export interface GetRecentBuildsInput {
  jobName: string
  limit?: number
}

export const getRecentBuilds = async (
  client: JenkinsClient,
  input: GetRecentBuildsInput,
): Promise<NormalizedBuild[]> =>
  readRecentBuilds(client, input.jobName, input.limit ?? 5)

import { JenkinsClient } from "../lib/client.js"
import { Errors } from "../common/index.js"
import { statusOf } from "../lib/errors.js"
import { buildNotFoundError } from "../lib/builds.js"

export interface DeleteBuildInput {
  jobName: string
  buildNumber: number
}

export const deleteBuild = async (
  client: JenkinsClient,
  input: DeleteBuildInput,
) => {
  const { jobName, buildNumber } = input
  try {
    await client.deleteBuild(jobName, buildNumber)
  } catch (err) {
    const status = statusOf(err)
    if (status === 404) throw await buildNotFoundError(client, jobName, buildNumber)
    if (status && status >= 400 && status !== 401)
      throw Errors.unexpected(`Delete build failed: HTTP ${status}`)
    throw err
  }
  return { jobName, buildNumber, deleted: true }
}

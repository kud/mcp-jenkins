import { JenkinsClient } from "../lib/client.js"
import { Errors } from "../common/index.js"
import { statusOf } from "../lib/errors.js"
import { buildNotFoundError } from "../lib/builds.js"

export interface ReplayBuildInput {
  jobName: string
  buildNumber: number
  mainScript?: string
}

export const replayBuild = async (
  client: JenkinsClient,
  input: ReplayBuildInput,
) => {
  const { jobName, buildNumber, mainScript } = input
  try {
    return await client.replayBuild(jobName, buildNumber, mainScript)
  } catch (err) {
    const status = statusOf(err)
    if (status === 404) throw await buildNotFoundError(client, jobName, buildNumber)
    if (status === 401) throw err
    if (status && status >= 400)
      throw Errors.unexpected(`Replay failed with status ${status}`)
    throw Errors.unexpected((err as Error).message)
  }
}

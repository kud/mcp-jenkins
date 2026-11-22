import { JenkinsClient } from "../lib/client.js"
import { requireConfirm } from "../lib/confirm.js"
import { Errors } from "../common/index.js"
import { statusOf } from "../lib/errors.js"
import { buildNotFoundError } from "../lib/builds.js"
import { checkJobName, parseBuildNumber } from "../tool-input.js"

export interface ReplayBuildInput {
  jobName: string
  buildNumber: number
  mainScript?: string
  confirm?: boolean
}

export const replayBuild = async (
  client: JenkinsClient,
  input: ReplayBuildInput,
) => {
  requireConfirm(input, `replay build ${input.buildNumber} of ${input.jobName}`)
  // Checked here too, not only at dispatch: these values are interpolated
  // into the URL the core client calls.
  const jobName = checkJobName(input.jobName)
  const buildNumber = parseBuildNumber(input.buildNumber) as number
  const { mainScript } = input
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

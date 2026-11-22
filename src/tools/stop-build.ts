import { JenkinsClient } from "../lib/client.js"
import { Errors } from "../common/index.js"
import { statusOf } from "../lib/errors.js"
import { buildNotFoundError } from "../lib/builds.js"
import { checkJobName, parseBuildNumber } from "../tool-input.js"

export interface StopBuildInput {
  jobName: string
  buildNumber: number
}

export const stopBuild = async (client: JenkinsClient, input: StopBuildInput) => {
  // Checked here too, not only at dispatch: these values are interpolated
  // into the URL the core client calls.
  const jobName = checkJobName(input.jobName)
  const buildNumber = parseBuildNumber(input.buildNumber) as number
  try {
    await client.stopBuild(jobName, buildNumber)
  } catch (err) {
    const status = statusOf(err)
    if (status === 404) throw await buildNotFoundError(client, jobName, buildNumber)
    if (status && status >= 400 && status !== 401)
      throw Errors.unexpected(`Stop build failed: HTTP ${status}`)
    throw err
  }
  return { jobName, buildNumber, stopped: true }
}

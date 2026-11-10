import { JenkinsClient } from "../lib/client.js"
import { Errors } from "../common/index.js"
import { isNotFound } from "../lib/errors.js"

export interface DisableJobInput {
  jobName: string
}

export const disableJob = async (client: JenkinsClient, input: DisableJobInput) => {
  try {
    await client.disableJob(input.jobName)
  } catch (err) {
    if (isNotFound(err)) throw Errors.jobNotFound(input.jobName)
    throw err
  }
  return { jobName: input.jobName, disabled: true }
}

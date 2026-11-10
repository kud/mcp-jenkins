import { JenkinsClient } from "../lib/client.js"
import { Errors } from "../common/index.js"
import { isNotFound } from "../lib/errors.js"

export interface EnableJobInput {
  jobName: string
}

export const enableJob = async (client: JenkinsClient, input: EnableJobInput) => {
  try {
    await client.enableJob(input.jobName)
  } catch (err) {
    if (isNotFound(err)) throw Errors.jobNotFound(input.jobName)
    throw err
  }
  return { jobName: input.jobName, enabled: true }
}

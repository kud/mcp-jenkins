import { JenkinsClient } from "../lib/client.js"
import { Errors } from "../common/index.js"
import { isNotFound } from "../lib/errors.js"

export interface DeleteJobInput {
  jobName: string
}

export const deleteJob = async (client: JenkinsClient, input: DeleteJobInput) => {
  try {
    await client.deleteJob(input.jobName)
  } catch (err) {
    if (isNotFound(err)) throw Errors.jobNotFound(input.jobName)
    throw err
  }
  return { jobName: input.jobName, deleted: true }
}

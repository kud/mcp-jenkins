import { JenkinsClient } from "../lib/client.js"
import { requireConfirm } from "../lib/confirm.js"
import { Errors } from "../common/index.js"
import { isNotFound } from "../lib/errors.js"

export interface DeleteJobInput {
  jobName: string
  confirm?: boolean
}

export const deleteJob = async (client: JenkinsClient, input: DeleteJobInput) => {
  requireConfirm(input, `permanently delete job ${input.jobName}`)
  try {
    await client.deleteJob(input.jobName)
  } catch (err) {
    if (isNotFound(err)) throw Errors.jobNotFound(input.jobName)
    throw err
  }
  return { jobName: input.jobName, deleted: true }
}

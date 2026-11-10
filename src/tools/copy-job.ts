import { JenkinsClient } from "../lib/client.js"
import { Errors } from "../common/index.js"
import { statusOf } from "../lib/errors.js"
import { normalizeJobFullName } from "../lib/jobs.js"

export interface CopyJobInput {
  fromName: string
  newName: string
}

export const copyJob = async (client: JenkinsClient, input: CopyJobInput) => {
  normalizeJobFullName(input.fromName)
  normalizeJobFullName(input.newName)
  try {
    await client.copyJob(input.fromName, input.newName)
  } catch (err) {
    const status = statusOf(err)
    if (status === 404) throw Errors.jobNotFound(input.fromName)
    if (status && status >= 400 && status !== 401)
      throw Errors.unexpected(`Copy job failed: HTTP ${status}`)
    throw err
  }
  return { fromName: input.fromName, newName: input.newName, copied: true }
}

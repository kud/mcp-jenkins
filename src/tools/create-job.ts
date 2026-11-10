import { JenkinsClient } from "../lib/client.js"
import { Errors } from "../common/index.js"
import { statusOf } from "../lib/errors.js"
import { normalizeJobFullName } from "../lib/jobs.js"

export interface CreateJobInput {
  jobName: string
  configXml: string
}

export const createJob = async (client: JenkinsClient, input: CreateJobInput) => {
  normalizeJobFullName(input.jobName)
  try {
    await client.createJob(input.jobName, input.configXml)
  } catch (err) {
    const status = statusOf(err)
    if (status && status >= 400 && status !== 401)
      throw Errors.unexpected(`Create job failed: HTTP ${status}`)
    throw err
  }
  return { jobName: input.jobName, created: true }
}

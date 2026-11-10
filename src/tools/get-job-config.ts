import { JenkinsClient } from "../lib/client.js"
import { Errors } from "../common/index.js"
import { isNotFound } from "../lib/errors.js"

export interface GetJobConfigInput {
  jobName: string
}

export const getJobConfig = async (
  client: JenkinsClient,
  input: GetJobConfigInput,
) => {
  try {
    return await client.getJobConfig(input.jobName)
  } catch (err) {
    if (isNotFound(err)) throw Errors.jobNotFound(input.jobName)
    throw err
  }
}

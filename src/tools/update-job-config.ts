import { JenkinsClient } from "../lib/client.js"
import { Errors } from "../common/index.js"
import { isNotFound } from "../lib/errors.js"

export interface UpdateJobConfigInput {
  jobName: string
  configXml: string
}

export const updateJobConfig = async (
  client: JenkinsClient,
  input: UpdateJobConfigInput,
) => {
  try {
    return await client.updateJobConfig(input.jobName, input.configXml)
  } catch (err) {
    if (isNotFound(err)) throw Errors.jobNotFound(input.jobName)
    throw err
  }
}

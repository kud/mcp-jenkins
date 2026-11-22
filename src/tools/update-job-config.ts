import { JenkinsClient } from "../lib/client.js"
import { requireConfirm } from "../lib/confirm.js"
import { Errors } from "../common/index.js"
import { isNotFound } from "../lib/errors.js"

export interface UpdateJobConfigInput {
  jobName: string
  configXml: string
  confirm?: boolean
}

export const updateJobConfig = async (
  client: JenkinsClient,
  input: UpdateJobConfigInput,
) => {
  requireConfirm(input, `replace the configuration of job ${input.jobName}`)
  try {
    return await client.updateJobConfig(input.jobName, input.configXml)
  } catch (err) {
    if (isNotFound(err)) throw Errors.jobNotFound(input.jobName)
    throw err
  }
}

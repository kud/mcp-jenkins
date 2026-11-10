import { JenkinsClient } from "../lib/client.js"
import { Errors } from "../common/index.js"
import { isNotFound } from "../lib/errors.js"
import { forgetJobPath } from "../lib/paths.js"

export interface RenameJobInput {
  jobName: string
  newName: string
}

export const renameJob = async (client: JenkinsClient, input: RenameJobInput) => {
  try {
    const result = await client.renameJob(input.jobName, input.newName)
    forgetJobPath(client, input.jobName)
    return result
  } catch (err) {
    if (isNotFound(err)) throw Errors.jobNotFound(input.jobName)
    throw err
  }
}

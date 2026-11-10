import { JenkinsClient } from "../lib/client.js"
import { getConsoleLog as readConsoleLog } from "../lib/console-log.js"

export interface GetConsoleLogInput {
  jobName: string
  buildNumber?: number
  maxSnippetLength?: number
  start?: number
  maxBytes?: number
  pattern?: string
}

export const getConsoleLog = async (
  client: JenkinsClient,
  input: GetConsoleLogInput,
) =>
  readConsoleLog(client, input.jobName, input.buildNumber, {
    maxSnippetLength: input.maxSnippetLength,
    start: input.start,
    maxBytes: input.maxBytes,
    pattern: input.pattern,
  })

import { JenkinsClient } from "../lib/client.js"
import { McpError } from "../common/index.js"

export interface QuietDownInput {
  reason?: string
  confirm: boolean
}

export const quietDown = async (
  client: JenkinsClient,
  input: QuietDownInput,
) => {
  if (!input.confirm)
    throw new McpError(
      "CONFIRM_REQUIRED",
      "Set confirm: true to put Jenkins into quiet mode (no new builds will start).",
      400,
    )
  return client.quietDown(input.reason)
}

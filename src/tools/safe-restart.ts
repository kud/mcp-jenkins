import { JenkinsClient } from "../lib/client.js"
import { McpError } from "../common/index.js"

export interface SafeRestartInput {
  confirm: boolean
}

export const safeRestart = async (
  client: JenkinsClient,
  input: SafeRestartInput,
) => {
  if (!input.confirm)
    throw new McpError(
      "CONFIRM_REQUIRED",
      "Set confirm: true to safely restart Jenkins (waits for running builds to finish).",
      400,
    )
  return client.safeRestart()
}

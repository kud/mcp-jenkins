import { JenkinsClient } from "../lib/client.js"
import { McpError } from "../common/index.js"
import { isNotFound } from "../lib/errors.js"

export interface ToggleNodeOfflineInput {
  nodeName: string
  offlineMessage?: string
}

export const toggleNodeOffline = async (
  client: JenkinsClient,
  input: ToggleNodeOfflineInput,
) => {
  try {
    return await client.toggleNodeOffline(input.nodeName, input.offlineMessage)
  } catch (err) {
    if (isNotFound(err))
      throw new McpError("NODE_NOT_FOUND", `Node not found: ${input.nodeName}`, 404)
    throw err
  }
}

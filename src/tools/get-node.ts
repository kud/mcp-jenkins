import { JenkinsClient } from "../lib/client.js"
import { McpError } from "../common/index.js"
import { isNotFound } from "../lib/errors.js"

export interface GetNodeInput {
  nodeName: string
}

export const getNode = async (client: JenkinsClient, input: GetNodeInput) => {
  try {
    return await client.getNode(input.nodeName)
  } catch (err) {
    if (isNotFound(err))
      throw new McpError("NODE_NOT_FOUND", `Node not found: ${input.nodeName}`, 404)
    throw err
  }
}

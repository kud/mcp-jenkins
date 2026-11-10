import { JenkinsClient } from "../lib/client.js"
import { McpError } from "../common/index.js"
import { isNotFound } from "../lib/errors.js"

export interface GetViewInput {
  viewName: string
}

export const getView = async (client: JenkinsClient, input: GetViewInput) => {
  try {
    return await client.getView(input.viewName)
  } catch (err) {
    if (isNotFound(err))
      throw new McpError("VIEW_NOT_FOUND", `View not found: ${input.viewName}`, 404)
    throw err
  }
}

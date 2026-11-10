import { JenkinsClient } from "../lib/client.js"

export interface ListNodesInput {}

export const listNodes = async (
  client: JenkinsClient,
  _input: ListNodesInput,
) => client.listNodes()

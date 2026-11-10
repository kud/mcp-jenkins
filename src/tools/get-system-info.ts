import { JenkinsClient } from "../lib/client.js"

export interface GetSystemInfoInput {}

export const getSystemInfo = async (
  client: JenkinsClient,
  _input: GetSystemInfoInput,
) => client.getSystemInfo()

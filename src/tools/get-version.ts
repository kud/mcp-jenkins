import { JenkinsClient } from "../lib/client.js"

export interface GetVersionInput {}

export const getVersion = async (
  client: JenkinsClient,
  _input: GetVersionInput,
) => client.getVersion()

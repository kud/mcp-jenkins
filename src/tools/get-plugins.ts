import { JenkinsClient } from "../lib/client.js"

export interface GetPluginsInput {}

export const getPlugins = async (
  client: JenkinsClient,
  _input: GetPluginsInput,
) => client.getPlugins()

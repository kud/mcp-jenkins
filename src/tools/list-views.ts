import { JenkinsClient } from "../lib/client.js"

export interface ListViewsInput {}

export const listViews = async (
  client: JenkinsClient,
  _input: ListViewsInput,
) => client.listViews()

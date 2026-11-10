import { JenkinsClient } from "../lib/client.js"

export interface CancelQuietDownInput {}

export const cancelQuietDown = async (
  client: JenkinsClient,
  _input: CancelQuietDownInput,
) => client.cancelQuietDown()

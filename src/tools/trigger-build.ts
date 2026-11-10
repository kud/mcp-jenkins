import { JenkinsClient } from "../lib/client.js"
import { triggerBuild as trigger } from "../lib/trigger.js"

export interface TriggerBuildInput {
  jobName: string
  params?: Record<string, any>
  useDefaults?: boolean
}

export const triggerBuild = async (
  client: JenkinsClient,
  input: TriggerBuildInput,
) => trigger(client, input.jobName, input.params, { useDefaults: input.useDefaults })

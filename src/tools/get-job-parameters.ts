import { JenkinsClient } from "../lib/client.js"
import { fetchParameterDefinitions } from "../lib/jobs.js"

export interface GetJobParametersInput {
  jobName: string
}

export interface JobParameter {
  name: string
  type: string
  description: string
  defaultValue: unknown
  choices?: string[]
}

export const getJobParameters = async (
  client: JenkinsClient,
  input: GetJobParametersInput,
): Promise<{ jobName: string; parameters: JobParameter[] }> => {
  const defs = await fetchParameterDefinitions(client, input.jobName)
  const parameters = defs.map((d) => {
    const raw = d.type ?? d._class ?? ""
    const type = raw
      .replace(/^.*\./, "")
      .replace(/ParameterDefinition$/, "")
      .toLowerCase()
    const entry: JobParameter = {
      name: d.name ?? "",
      type,
      description: d.description ?? "",
      defaultValue: d.defaultParameterValue?.value ?? null,
    }
    if (Array.isArray(d.choices)) entry.choices = d.choices
    return entry
  })
  return { jobName: input.jobName, parameters }
}

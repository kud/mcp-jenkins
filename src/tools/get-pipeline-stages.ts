import { JenkinsClient } from "../lib/client.js"
import { isNotFound } from "../lib/errors.js"
import { subResource404Error } from "../lib/builds.js"

export interface GetPipelineStagesInput {
  jobName: string
  buildNumber: number
}

export const getPipelineStages = async (
  client: JenkinsClient,
  input: GetPipelineStagesInput,
) => {
  const { jobName, buildNumber } = input
  let data: any
  try {
    data = await client.getPipelineStages(jobName, buildNumber)
  } catch (err) {
    if (!isNotFound(err)) throw err
    const missing = await subResource404Error(client, jobName, buildNumber)
    if (missing) throw missing
    return {
      jobName,
      buildNumber,
      message: "Not a pipeline build or workflow API not available",
    }
  }
  return {
    jobName,
    buildNumber,
    status: data.status || "",
    stages: (data.stages || []).map((stage: any) => ({
      id: stage.id || "",
      name: stage.name || "",
      status: stage.status || "",
      startTimeMillis: stage.startTimeMillis || 0,
      durationMillis: stage.durationMillis || 0,
      pauseDurationMillis: stage.pauseDurationMillis || 0,
    })),
  }
}

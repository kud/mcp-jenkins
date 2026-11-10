import { JenkinsClient } from "@kud/jenkins"
import { Errors } from "../common/index.js"
import { statusOf } from "./errors.js"
import { fetchParameterDefinitions } from "./jobs.js"

export const triggerBuild = async (
  client: JenkinsClient,
  jobName: string,
  params?: Record<string, any>,
  options?: { useDefaults?: boolean },
): Promise<{ jobName: string; queueUrl: string | null }> => {
  const passed = params ?? {}
  const passedKeys = Object.keys(passed)

  // /build answers 400 on a job that has parameter definitions, and deploy
  // style parameters that default to true must never be triggered from
  // Jenkins' own silent defaults. Read the definitions first: they choose the
  // endpoint and validate the params, so a bad trigger never leaves the
  // server. A 404 on the lookup itself means the job is missing.
  const defs = (await fetchParameterDefinitions(client, jobName)).map((d) => ({
    name: d.name ?? "",
    type: d.type ?? d._class ?? "",
    defaultValue: d.defaultParameterValue?.value,
  }))
  const isParameterized = defs.length > 0
  const defNameSet = new Set(defs.map((d) => d.name))

  const unknown = passedKeys.filter((k) => !defNameSet.has(k))
  if (unknown.length > 0) {
    const valid = isParameterized
      ? ` Valid parameters: ${defs.map((d) => d.name).join(", ")}.`
      : " This job takes no parameters."
    throw Errors.invalidInput(
      `Unknown parameters for job ${jobName}: ${unknown.join(", ")}.${valid}`,
    )
  }

  // A missing parameter left to Jenkins silently picks up the job's own
  // default, which for deploy flags defaults to true. Refuse unless the
  // caller explicitly opted into the defaults.
  const useDefaults = options?.useDefaults === true
  const missing = defs.filter((d) => !(d.name in passed))
  if (missing.length > 0 && !useDefaults) {
    const defaultLabel = (v: any) =>
      v === undefined ? "none" : typeof v === "string" ? v : JSON.stringify(v)
    throw Errors.parametersRequired(
      `Job ${jobName} has parameters that were not passed: ` +
        missing
          .map(
            (d) =>
              `${d.name} (${d.type}, default ${defaultLabel(d.defaultValue)})`,
          )
          .join(", ") +
        ". Pass them in params, or set useDefaults: true to let Jenkins fill them.",
    )
  }

  let res: { location: string | null }
  try {
    res = isParameterized
      ? await client.triggerBuildWithParameters(
          jobName,
          Object.fromEntries(
            Object.entries(passed).map(([k, v]) => [k, String(v)]),
          ),
        )
      : await client.triggerBuild(jobName)
  } catch (err) {
    const status = statusOf(err)
    if (status === 404) throw Errors.jobNotFound(jobName)
    if (status === 401) throw err
    throw Errors.unexpected(
      `Trigger build failed: ${status ? `HTTP ${status}` : (err as Error).message}`,
    )
  }
  // A real queueing trigger answers 201 with the queue item's Location. An
  // authentication redirect lands on a 200 page with none, which must not
  // read as a queued build.
  if (!res.location)
    throw Errors.unexpected(
      `Trigger build for ${jobName} returned no queue Location header`,
    )
  return { jobName, queueUrl: res.location }
}

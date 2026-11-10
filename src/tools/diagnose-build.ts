import { JenkinsClient } from "../lib/client.js"
import { Errors } from "../common/index.js"
import { isNotFound } from "../lib/errors.js"
import { buildNotFoundError, getLastBuild } from "../lib/builds.js"
import { formatDiagnosis, parseBuildUrl } from "../lib/diagnosis.js"

export interface DiagnoseBuildInput {
  jobName?: string
  buildNumber?: number
  url?: string
  lines?: number
  tail?: boolean
}

export const diagnoseBuild = async (
  client: JenkinsClient,
  input: DiagnoseBuildInput,
) => {
  const fromUrl = input.url ? parseBuildUrl(input.url, client.baseUrl) : null
  const jobName = fromUrl?.jobName ?? input.jobName
  if (!jobName) throw Errors.invalidInput("Pass jobName, or the build's url")
  if (
    input.lines !== undefined &&
    (!Number.isInteger(input.lines) || input.lines <= 0)
  )
    throw Errors.invalidInput("lines must be a positive whole number")

  // The latest build is looked up here, by number, rather than left to the
  // core: its own fallback reads the job at depth=1, which expands every build
  // the job has ever run (issue #18).
  const build =
    fromUrl?.build ??
    input.buildNumber ??
    Number((await getLastBuild(client, jobName)).id)

  let d
  try {
    d = await client.diagnoseBuild(jobName, build, { lines: input.lines ?? 80 })
  } catch (err) {
    if (isNotFound(err) && typeof build === "number")
      throw await buildNotFoundError(client, jobName, build)
    if (isNotFound(err)) throw Errors.jobNotFound(jobName)
    throw err
  }
  return {
    job: d.job,
    build: d.build,
    result: d.result,
    url: d.url,
    summary: formatDiagnosis(d, { tail: input.tail === true }),
  }
}

import { JenkinsClient } from "@kud/jenkins"
import { Errors, McpError } from "../common/index.js"
import { isNotFound } from "./errors.js"
import { withJobPath } from "./paths.js"

// The exact set of fields normalizeBuild reads. Sent as a `tree` filter so
// Jenkins serialises these and nothing else — without one it returns the entire
// build record, changeset and all, of which we keep six values. See issue #18.
export const BUILD_FIELDS = "number,result,duration,timestamp,url,building"
const BUILD_TREE = `builds[${BUILD_FIELDS}]`

export interface NormalizedBuild {
  id: string
  result: "SUCCESS" | "FAILURE" | "ABORTED" | "RUNNING" | string
  durationMs: number
  timestamp: string // ISO
  url: string
}

export const normalizeBuild = (raw: any): NormalizedBuild => {
  const building = raw.building === true
  const result = building ? "RUNNING" : raw.result || "RUNNING"
  return {
    id: String(raw.number ?? raw.id ?? ""),
    result,
    durationMs: raw.duration ?? 0,
    timestamp: raw.timestamp
      ? new Date(raw.timestamp).toISOString()
      : new Date().toISOString(),
    url: raw.url || "",
  }
}

// A cheap read of the job record, to tell a missing job from a missing build.
export const jobExists = async (
  client: JenkinsClient,
  jobName: string,
): Promise<boolean> => {
  try {
    await withJobPath(client, jobName, (p) =>
      client.tree(`${p}/api/json`, "name"),
    )
    return true
  } catch (err) {
    if (isNotFound(err)) return false
    throw err
  }
}

// A 404 on a URL carrying the build number means the job is gone or the
// build is gone; the response alone cannot tell which, so ask once.
export const buildNotFoundError = async (
  client: JenkinsClient,
  jobName: string,
  buildNumber: number,
): Promise<McpError> =>
  (await jobExists(client, jobName))
    ? Errors.buildNotFound(jobName, buildNumber)
    : Errors.jobNotFound(jobName)

// A 404 on a build sub-resource (testReport, wfapi, artifact/…) can also mean
// the build exists and only the sub-resource is missing. Null hands that case
// back to the caller's fallback.
export const subResource404Error = async (
  client: JenkinsClient,
  jobName: string,
  buildNumber: number,
): Promise<McpError | null> => {
  try {
    await withJobPath(client, jobName, (p) =>
      client.tree(`${p}/${buildNumber}/api/json`, "number"),
    )
    return null
  } catch (err) {
    if (isNotFound(err)) return buildNotFoundError(client, jobName, buildNumber)
    throw err
  }
}

export const getRecentBuilds = async (
  client: JenkinsClient,
  jobName: string,
  limit = 5,
): Promise<NormalizedBuild[]> => {
  if (!Number.isInteger(limit) || limit < 1) {
    throw Errors.invalidInput("limit must be a positive whole number")
  }
  try {
    // The range suffix makes Jenkins do the slicing rather than expanding every
    // build the job has ever run. See issue #18.
    const raw = await withJobPath(client, jobName, (p) =>
      client.tree(`${p}/api/json`, `${BUILD_TREE}{0,${limit}}`),
    )
    if (!raw?.builds) return []
    return raw.builds.slice(0, limit).map(normalizeBuild)
  } catch (err) {
    if (isNotFound(err)) throw Errors.jobNotFound(jobName)
    throw err
  }
}

// The lastBuild URL 404s both when the job is gone and when it has never been
// built; a never-built job gets its own error rather than pretending to be
// missing, and callers rely on this throwing rather than returning null.
export const getLastBuild = async (
  client: JenkinsClient,
  jobName: string,
): Promise<NormalizedBuild> => {
  try {
    const raw = await withJobPath(client, jobName, (p) =>
      client.tree(`${p}/lastBuild/api/json`, BUILD_FIELDS),
    )
    return normalizeBuild(raw)
  } catch (err) {
    if (isNotFound(err)) {
      if (await jobExists(client, jobName)) throw Errors.noBuilds(jobName)
      throw Errors.jobNotFound(jobName)
    }
    throw err
  }
}

export const getBuild = async (
  client: JenkinsClient,
  jobName: string,
  buildNumber: number,
): Promise<NormalizedBuild> => {
  try {
    const raw = await withJobPath(client, jobName, (p) =>
      client.tree(`${p}/${buildNumber}/api/json`, BUILD_FIELDS),
    )
    return normalizeBuild(raw)
  } catch (err) {
    if (isNotFound(err))
      throw await buildNotFoundError(client, jobName, buildNumber)
    throw err
  }
}

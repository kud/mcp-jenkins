import { JenkinsClient, jobPath } from "@kud/jenkins"
import { Errors } from "../common/index.js"
import { isNotFound } from "./errors.js"
import { withJobPath } from "./paths.js"

export interface JenkinsJob {
  name: string
  url: string
}

export interface ListJobsOptions {
  folder?: string
  recursive?: boolean
  maxDepth?: number
  includeFolders?: boolean
}

interface JenkinsJobApi {
  name?: string
  url?: string
  _class?: string
  jobs?: unknown[]
}

// A Jenkins full name with no empty segment. createItem and copy are posted
// to the parent folder, so a stray "a//b" must fail here as bad input rather
// than reach Jenkins as a different item.
export const normalizeJobFullName = (name: string): string => {
  const fullName = name.trim().replace(/^\/+|\/+$/g, "")
  if (!fullName || fullName.split("/").some((segment) => !segment)) {
    throw Errors.invalidInput(
      "Job name must be a non-empty Jenkins full name without empty path segments",
    )
  }
  return fullName
}

const isJobContainer = (job: JenkinsJobApi): boolean => {
  const className = job._class ?? ""
  return (
    Array.isArray(job.jobs) ||
    className.endsWith("Folder") ||
    className.includes(".folder.")
  )
}

// List jobs and folders, named by their Jenkins full names (for example,
// Sandbox/application-sandbox).
//
// `recursive` defaults to false, and must stay that way. Traversal awaits
// sequentially, one HTTP round-trip per container, with no concurrency and no
// request budget -- so a tree of 200 folders costs 200 serial requests. With a
// true default, every existing call would silently acquire that cost, and
// `searchJobs()` would turn from a sub-second tool into a crawl of the whole
// instance. Recursive-by-default only becomes safe alongside bounded
// concurrency and a total-request cap that fails loudly.
export const listJobs = async (
  client: JenkinsClient,
  options: ListJobsOptions = {},
): Promise<JenkinsJob[]> => {
  const folder = options.folder?.trim().replace(/^\/+|\/+$/g, "") ?? ""
  const recursive = options.recursive ?? false
  const includeFolders = options.includeFolders ?? true
  // NaN survives Math.floor/max/min, and `depth < NaN` is always false, so a
  // non-numeric depth would silently return only the top level -- which reads
  // as "the folder is empty" rather than as bad input.
  const requested = options.maxDepth ?? 10
  const requestedDepth = Number.isFinite(requested) ? requested : 10
  const maxDepth = Math.min(Math.max(Math.floor(requestedDepth), 0), 100)
  const jobs: JenkinsJob[] = []
  const visited = new Set<string>()
  const tree = "jobs[name,url,_class,jobs[name]]"

  const readContainer = async (
    parentFullName: string,
    depth: number,
  ): Promise<void> => {
    if (visited.has(parentFullName)) return
    visited.add(parentFullName)

    const data = await client.tree(
      parentFullName ? `${jobPath(parentFullName)}/api/json` : "api/json",
      tree,
    )
    const children: JenkinsJobApi[] = Array.isArray(data?.jobs) ? data.jobs : []

    for (const child of children) {
      if (!child?.name || !child?.url) continue
      const fullName = parentFullName
        ? `${parentFullName}/${child.name}`
        : child.name
      const isContainer = isJobContainer(child)

      if (includeFolders || !isContainer) {
        jobs.push({ name: fullName, url: child.url })
      }

      if (recursive && isContainer && depth < maxDepth) {
        await readContainer(fullName, depth + 1)
      }
    }
  }

  try {
    await readContainer(folder, 0)
    return jobs
  } catch (err) {
    if (folder && isNotFound(err)) throw Errors.jobNotFound(folder)
    throw err
  }
}

export const searchJobs = async (
  client: JenkinsClient,
  query: string,
  options: ListJobsOptions = {},
): Promise<JenkinsJob[]> => {
  if (!query.trim()) return []
  const all = await listJobs(client, options)
  const q = query.toLowerCase()
  return all.filter((j) => j.name.toLowerCase().includes(q))
}

export interface ParameterDefinition {
  name?: string
  type?: string
  _class?: string
  description?: string
  defaultParameterValue?: { value?: unknown }
  choices?: string[]
}

// The job's raw parameter definitions, shared by get_job_parameters (which
// formats them) and trigger_build (which validates against them). Read with
// an encoded `tree` rather than the core's getJobParameters, whose raw
// brackets some reverse proxies answer with HTTP 400.
export const fetchParameterDefinitions = async (
  client: JenkinsClient,
  jobName: string,
): Promise<ParameterDefinition[]> => {
  try {
    const data = await withJobPath(client, jobName, (p) =>
      client.tree(
        `${p}/api/json`,
        "property[parameterDefinitions[name,type,description,defaultParameterValue[value],choices]]",
      ),
    )
    const paramProp = (data?.property ?? []).find(
      (p: any) =>
        p._class === "hudson.model.ParametersDefinitionProperty" ||
        Array.isArray(p.parameterDefinitions),
    )
    return paramProp?.parameterDefinitions ?? []
  } catch (err) {
    if (isNotFound(err)) throw Errors.jobNotFound(jobName)
    throw err
  }
}

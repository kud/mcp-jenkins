import { JenkinsClient, jobPath } from "@kud/jenkins"
import { isNotFound } from "./errors.js"

// The MCP reads job endpoints with its own `tree` filters (a ranged build
// list, a six-field build record), so it goes through the core's `tree()`,
// which takes a ready-made path. A job name's slashes are folder boundaries
// in that path, except inside a multibranch project, where a branch such as
// "feature/x" is one segment. Only the core knows how to tell them apart: it
// walks the hierarchy reading each level's `_class`.
type PathResolver = { _resolveMultibranchPath(job: string): Promise<string> }

const resolved = new WeakMap<JenkinsClient, Map<string, string>>()

const cacheFor = (client: JenkinsClient): Map<string, string> => {
  let cache = resolved.get(client)
  if (!cache) resolved.set(client, (cache = new Map()))
  return cache
}

// Try the plain path first, which is right for every job outside a
// multibranch project and costs nothing extra. On a 404 for a slashed name,
// resolve the real path once, remember it, and retry; a resolution that
// changes nothing leaves the original 404 to the caller.
export const withJobPath = async <T>(
  client: JenkinsClient,
  job: string,
  request: (path: string) => Promise<T>,
): Promise<T> => {
  const cache = cacheFor(client)
  const known = cache.get(job)
  if (known) return request(known)

  const plain = jobPath(job)
  try {
    return await request(plain)
  } catch (err) {
    if (!isNotFound(err) || !job.includes("/")) throw err
    const real = await (
      client as unknown as PathResolver
    )._resolveMultibranchPath(job)
    if (real === plain) throw err
    cache.set(job, real)
    return request(real)
  }
}

export const forgetJobPath = (client: JenkinsClient, job: string): void => {
  resolved.get(client)?.delete(job)
}

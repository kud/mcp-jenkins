import { JenkinsClient } from "../lib/client.js"
import { isNotFound } from "../lib/errors.js"
import { buildNotFoundError } from "../lib/builds.js"
import { withJobPath } from "../lib/paths.js"

export interface ListArtifactsInput {
  jobName: string
  buildNumber: number
}

export const listArtifacts = async (
  client: JenkinsClient,
  input: ListArtifactsInput,
): Promise<{ fileName: string; relativePath: string; url: string }[]> => {
  const { jobName, buildNumber } = input
  try {
    return await withJobPath(client, jobName, async (p) => {
      const data = await client.tree(
        `${p}/${buildNumber}/api/json`,
        "artifacts[fileName,relativePath]",
      )
      if (!data || !Array.isArray(data.artifacts)) return []
      return data.artifacts.map((a: any) => ({
        fileName: a.fileName,
        relativePath: a.relativePath,
        url: `${client.baseUrl}/${p}/${buildNumber}/artifact/${a.relativePath}`,
      }))
    })
  } catch (err) {
    if (isNotFound(err)) throw await buildNotFoundError(client, jobName, buildNumber)
    throw err
  }
}

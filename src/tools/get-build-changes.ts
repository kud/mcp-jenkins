import { JenkinsClient } from "../lib/client.js"
import { isNotFound } from "../lib/errors.js"
import { buildNotFoundError } from "../lib/builds.js"
import { withJobPath } from "../lib/paths.js"

export interface GetBuildChangesInput {
  jobName: string
  buildNumber: number
}

export const getBuildChanges = async (
  client: JenkinsClient,
  input: GetBuildChangesInput,
) => {
  const { jobName, buildNumber } = input
  let data: any
  try {
    data = await withJobPath(client, jobName, (p) =>
      client.tree(
        `${p}/${buildNumber}/api/json`,
        "changeSet[items[author[fullName],msg,commitId,timestamp]]",
      ),
    )
  } catch (err) {
    if (isNotFound(err)) throw await buildNotFoundError(client, jobName, buildNumber)
    throw err
  }
  if (!data?.changeSet?.items) return { jobName, buildNumber, changes: [] }
  return {
    jobName,
    buildNumber,
    changes: data.changeSet.items.map((change: any) => ({
      author: change.author?.fullName || "unknown",
      message: change.msg || "",
      commitId: change.commitId || "",
      timestamp: change.timestamp
        ? new Date(change.timestamp).toISOString()
        : null,
    })),
  }
}

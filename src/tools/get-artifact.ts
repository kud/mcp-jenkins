import { JenkinsClient } from "../lib/client.js"
import { Errors } from "../common/index.js"
import { isNotFound } from "../lib/errors.js"
import { subResource404Error } from "../lib/builds.js"

export interface GetArtifactInput {
  jobName: string
  buildNumber: number
  relativePath: string
}

export const getArtifact = async (
  client: JenkinsClient,
  input: GetArtifactInput,
) => {
  const { jobName, buildNumber, relativePath } = input
  try {
    const buf = await client.downloadArtifact(jobName, buildNumber, relativePath)
    return {
      fileName: relativePath.split("/").pop() || relativePath,
      relativePath,
      size: buf.length,
      base64: buf.toString("base64"),
    }
  } catch (err) {
    if (isNotFound(err)) {
      const missing = await subResource404Error(client, jobName, buildNumber)
      throw missing ?? Errors.artifactNotFound(relativePath)
    }
    throw err
  }
}

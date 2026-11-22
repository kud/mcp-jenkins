import { JenkinsClient } from "../lib/client.js"
import { Errors } from "../common/index.js"
import { isNotFound } from "../lib/errors.js"
import { subResource404Error } from "../lib/builds.js"
import {
  checkArtifactPath,
  checkJobName,
  parseBuildNumber,
} from "../tool-input.js"

export interface GetArtifactInput {
  jobName: string
  buildNumber: number
  relativePath: string
}

export const getArtifact = async (
  client: JenkinsClient,
  input: GetArtifactInput,
) => {
  // Checked here too, not only at dispatch: these values are interpolated
  // into the URL the core client calls, the artifact path unencoded.
  const jobName = checkJobName(input.jobName)
  const buildNumber = parseBuildNumber(input.buildNumber) as number
  const relativePath = checkArtifactPath(input.relativePath)
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

import { writeFile } from "node:fs/promises"
import { isAbsolute } from "node:path"
import { JenkinsClient } from "../lib/client.js"
import { Errors } from "../common/index.js"
import { isNotFound } from "../lib/errors.js"
import { subResource404Error } from "../lib/builds.js"

const downloadArtifact = async (
  client: JenkinsClient,
  jobName: string,
  buildNumber: number,
  relativePath: string,
) => {
  try {
    return await client.downloadArtifact(jobName, buildNumber, relativePath)
  } catch (err) {
    if (isNotFound(err)) {
      const missing = await subResource404Error(client, jobName, buildNumber)
      throw missing ?? Errors.artifactNotFound(relativePath)
    }
    throw err
  }
}

export interface GetArtifactInput {
  jobName: string
  buildNumber: number
  relativePath: string
}

export interface DownloadArtifactToFileInput extends GetArtifactInput {
  destinationPath: string
}

export const getArtifact = async (
  client: JenkinsClient,
  input: GetArtifactInput,
) => {
  const { jobName, buildNumber, relativePath } = input
  const buf = await downloadArtifact(client, jobName, buildNumber, relativePath)
  return {
    fileName: relativePath.split("/").pop() || relativePath,
    relativePath,
    size: buf.length,
    base64: buf.toString("base64"),
  }
}

export const downloadArtifactToFile = async (
  client: JenkinsClient,
  input: DownloadArtifactToFileInput,
) => {
  const { jobName, buildNumber, relativePath, destinationPath } = input
  if (!isAbsolute(destinationPath)) {
    throw new Error("destinationPath must be an absolute path.")
  }

  const buf = await downloadArtifact(client, jobName, buildNumber, relativePath)
  try {
    await writeFile(destinationPath, buf, { flag: "wx", mode: 0o600 })
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      err.code === "EEXIST"
    ) {
      throw err
    }
    throw new Error(
      `Failed to write ${destinationPath}; a partial file may remain.`,
      { cause: err },
    )
  }

  return {
    fileName: relativePath.split("/").pop() || relativePath,
    relativePath,
    destinationPath,
    size: buf.length,
  }
}

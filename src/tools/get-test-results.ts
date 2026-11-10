import { JenkinsClient } from "../lib/client.js"
import { isNotFound } from "../lib/errors.js"
import { subResource404Error } from "../lib/builds.js"

export interface GetTestResultsInput {
  jobName: string
  buildNumber: number
}

export const getTestResults = async (
  client: JenkinsClient,
  input: GetTestResultsInput,
) => {
  const { jobName, buildNumber } = input
  let data: any
  try {
    data = await client.getTestReport(jobName, buildNumber)
  } catch (err) {
    if (!isNotFound(err)) throw err
    const missing = await subResource404Error(client, jobName, buildNumber)
    if (missing) throw missing
    return {
      jobName,
      buildNumber,
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      message: "No test results found",
    }
  }
  return {
    jobName,
    buildNumber,
    totalTests: data.totalCount || 0,
    passedTests: data.passCount || 0,
    failedTests: data.failCount || 0,
    skippedTests: data.skipCount || 0,
    duration: data.duration || 0,
    suites: data.suites || [],
  }
}

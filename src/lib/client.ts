import { JenkinsClient } from "@kud/jenkins"
import type { JenkinsEnv } from "../common/index.js"

export { JenkinsClient }

// One core client per configured instance. The core builds a Basic header
// from a user and token, and sends nothing when both are empty, which is
// exactly the anonymous case. A bearer token has no constructor slot, so it
// replaces the header the core would otherwise send: `authHeader` is the
// field every request reads.
export const createJenkinsClient = (env: JenkinsEnv): JenkinsClient => {
  const basic = !env.JENKINS_ANONYMOUS && !env.JENKINS_BEARER_TOKEN
  const client = new JenkinsClient(
    env.JENKINS_URL,
    basic ? (env.JENKINS_USER ?? "") : "",
    basic ? (env.JENKINS_API_TOKEN ?? "") : "",
    { timeout: env.JENKINS_TIMEOUT_MS },
  )
  if (!env.JENKINS_ANONYMOUS && env.JENKINS_BEARER_TOKEN)
    client.authHeader = "Bearer " + env.JENKINS_BEARER_TOKEN
  return client
}

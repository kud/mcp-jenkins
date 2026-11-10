import { JenkinsClient } from "@kud/jenkins"
import type { JenkinsEnv } from "../common/index.js"

export { JenkinsClient }

// One core client per configured instance. Anonymous sends no Authorization
// header at all; otherwise a bearer token wins over a user and API token, as
// the environment loader has always ranked them.
export const createJenkinsClient = (env: JenkinsEnv): JenkinsClient => {
  if (env.JENKINS_ANONYMOUS)
    return new JenkinsClient(env.JENKINS_URL, "", "", {
      timeout: env.JENKINS_TIMEOUT_MS,
    })
  return new JenkinsClient(
    env.JENKINS_URL,
    env.JENKINS_USER ?? "",
    env.JENKINS_API_TOKEN ?? "",
    {
      timeout: env.JENKINS_TIMEOUT_MS,
      auth: env.JENKINS_BEARER_TOKEN
        ? { bearer: env.JENKINS_BEARER_TOKEN }
        : undefined,
    },
  )
}

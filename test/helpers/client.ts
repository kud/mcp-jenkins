import { createJenkinsClient } from "../../src/lib/client.js"
import { BASE_URL } from "./fake-jenkins.js"

export const makeClient = () =>
  createJenkinsClient({
    JENKINS_URL: BASE_URL,
    JENKINS_USER: "u",
    JENKINS_API_TOKEN: "t",
    JENKINS_TIMEOUT_MS: 30000,
  })

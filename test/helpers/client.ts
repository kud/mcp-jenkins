import { JenkinsClient } from "../../src/lib/jenkins-client.js"
import { BASE_URL } from "./fake-jenkins.js"

export const makeClient = () =>
  new JenkinsClient({
    baseUrl: BASE_URL,
    authHeader: "Basic " + Buffer.from("u:t").toString("base64"),
  })

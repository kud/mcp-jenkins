import { describe, it, expect, afterEach, vi } from "vitest"
import { installFakeJenkins } from "../helpers/fake-jenkins.js"
import { makeClient } from "../helpers/client.js"
import { getJobParameters } from "../../src/tools/get-job-parameters.js"

const job = (parameters?: unknown[]) =>
  installFakeJenkins([
    { segments: ["deploy-job"], _class: "org.jenkinsci.plugins.workflow.job.WorkflowJob", parameters },
  ])

afterEach(() => vi.unstubAllGlobals())

describe("getJobParameters tool", () => {
  it("returns empty parameters for a non-parameterised job", async () => {
    job()
    expect(await getJobParameters(makeClient(), { jobName: "deploy-job" })).toEqual({
      jobName: "deploy-job",
      parameters: [],
    })
  })

  it("shortens each type and fills absent fields", async () => {
    job([
      { name: "BRANCH", type: "StringParameterDefinition", description: "Branch", defaultParameterValue: { value: "main" } },
      { name: "FORCE", _class: "hudson.model.BooleanParameterDefinition", defaultParameterValue: { value: false } },
      { name: "SECRET", type: "PasswordParameterDefinition" },
    ])
    const { parameters } = await getJobParameters(makeClient(), { jobName: "deploy-job" })
    expect(parameters).toEqual([
      { name: "BRANCH", type: "string", description: "Branch", defaultValue: "main" },
      { name: "FORCE", type: "boolean", description: "", defaultValue: false },
      { name: "SECRET", type: "password", description: "", defaultValue: null },
    ])
  })

  it("keeps choices for a choice parameter", async () => {
    job([{ name: "ENV", type: "ChoiceParameterDefinition", choices: ["dev", "prod"], defaultParameterValue: { value: "dev" } }])
    const { parameters } = await getJobParameters(makeClient(), { jobName: "deploy-job" })
    expect(parameters[0].choices).toEqual(["dev", "prod"])
  })

  it("names a missing job", async () => {
    job()
    await expect(getJobParameters(makeClient(), { jobName: "nope" })).rejects.toThrow("Job not found: nope")
  })
})

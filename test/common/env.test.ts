import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  loadToolFilter,
  loadAllJenkinsInstances,
} from "../../src/common/env.js"

describe("loadToolFilter", () => {
  afterEach(() => {
    delete process.env["MCP_JENKINS_ALLOW_TOOLS"]
    delete process.env["MCP_JENKINS_BLOCK_TOOLS"]
  })

  it("returns null allowlist and empty blocklist when no env vars set", () => {
    const filter = loadToolFilter()
    expect(filter.allowlist).toBeNull()
    expect(filter.blocklist).toEqual([])
  })

  it("parses MCP_JENKINS_ALLOW_TOOLS into allowlist", () => {
    process.env["MCP_JENKINS_ALLOW_TOOLS"] =
      "jenkins_list_jobs,jenkins_get_job_status"
    const filter = loadToolFilter()
    expect(filter.allowlist).toEqual([
      "jenkins_list_jobs",
      "jenkins_get_job_status",
    ])
    expect(filter.blocklist).toEqual([])
  })

  it("parses MCP_JENKINS_BLOCK_TOOLS into blocklist", () => {
    process.env["MCP_JENKINS_BLOCK_TOOLS"] =
      "jenkins_delete_job,jenkins_trigger_build"
    const filter = loadToolFilter()
    expect(filter.allowlist).toBeNull()
    expect(filter.blocklist).toEqual([
      "jenkins_delete_job",
      "jenkins_trigger_build",
    ])
  })

  it("returns both when both env vars are set — caller decides precedence", () => {
    process.env["MCP_JENKINS_ALLOW_TOOLS"] = "jenkins_list_jobs"
    process.env["MCP_JENKINS_BLOCK_TOOLS"] = "jenkins_delete_job"
    const filter = loadToolFilter()
    expect(filter.allowlist).toEqual(["jenkins_list_jobs"])
    expect(filter.blocklist).toEqual(["jenkins_delete_job"])
  })

  it("trims whitespace around tool names", () => {
    process.env["MCP_JENKINS_ALLOW_TOOLS"] =
      " jenkins_list_jobs , jenkins_get_job_status "
    const filter = loadToolFilter()
    expect(filter.allowlist).toEqual([
      "jenkins_list_jobs",
      "jenkins_get_job_status",
    ])
  })

  it("supports pipe as delimiter", () => {
    process.env["MCP_JENKINS_ALLOW_TOOLS"] =
      "jenkins_list_jobs|jenkins_get_job_status"
    const filter = loadToolFilter()
    expect(filter.allowlist).toEqual([
      "jenkins_list_jobs",
      "jenkins_get_job_status",
    ])
  })

  it("handles a single tool name", () => {
    process.env["MCP_JENKINS_ALLOW_TOOLS"] = "jenkins_list_jobs"
    const filter = loadToolFilter()
    expect(filter.allowlist).toEqual(["jenkins_list_jobs"])
  })
})

describe("loadAllJenkinsInstances — 2-tier priority", () => {
  const cleanEnv = () => {
    delete process.env["MCP_JENKINS_URL"]
    delete process.env["MCP_JENKINS_USER"]
    delete process.env["MCP_JENKINS_API_TOKEN"]
    delete process.env["MCP_JENKINS_BEARER_TOKEN"]
    delete process.env["MCP_JENKINS_ANONYMOUS"]
    delete process.env["MCP_JENKINS_INSTANCES"]
    delete process.env["JENKINS_URL"]
    delete process.env["JENKINS_USER"]
    delete process.env["JENKINS_API_TOKEN"]
  }

  beforeEach(cleanEnv)
  afterEach(cleanEnv)

  it("loads from MCP_JENKINS_* env vars", () => {
    process.env["MCP_JENKINS_URL"] = "https://jenkins.example.com"
    process.env["MCP_JENKINS_USER"] = "admin"
    process.env["MCP_JENKINS_API_TOKEN"] = "mytoken"

    const instances = loadAllJenkinsInstances({})
    const env = instances.values().next().value
    expect(env.JENKINS_URL).toBe("https://jenkins.example.com")
    expect(env.JENKINS_USER).toBe("admin")
    expect(env.JENKINS_API_TOKEN).toBe("mytoken")
  })

  it("CLI args take priority over MCP_JENKINS_* env vars", () => {
    process.env["MCP_JENKINS_URL"] = "https://from-env.example.com"
    process.env["MCP_JENKINS_USER"] = "env-user"
    process.env["MCP_JENKINS_API_TOKEN"] = "env-token"

    const instances = loadAllJenkinsInstances({
      jenkinsUrl: "https://from-cli.example.com",
      jenkinsUser: "cli-user",
      jenkinsApiToken: "cli-token",
    })
    const env = instances.values().next().value
    expect(env.JENKINS_URL).toBe("https://from-cli.example.com")
    expect(env.JENKINS_USER).toBe("cli-user")
    expect(env.JENKINS_API_TOKEN).toBe("cli-token")
  })

  it("does NOT pick up bare JENKINS_URL without MCP_ prefix", () => {
    process.env["JENKINS_URL"] = "https://bare-jenkins.example.com"
    process.env["JENKINS_USER"] = "bare-user"
    process.env["JENKINS_API_TOKEN"] = "bare-token"

    expect(() => loadAllJenkinsInstances({})).toThrow("Missing MCP_JENKINS_URL")
  })

  it("strips trailing slash from URL", () => {
    process.env["MCP_JENKINS_URL"] = "https://jenkins.example.com/"
    process.env["MCP_JENKINS_USER"] = "admin"
    process.env["MCP_JENKINS_API_TOKEN"] = "token"

    const instances = loadAllJenkinsInstances({})
    const env = instances.values().next().value
    expect(env.JENKINS_URL).toBe("https://jenkins.example.com")
  })

  it("throws when no URL is provided", () => {
    expect(() => loadAllJenkinsInstances({})).toThrow("Missing MCP_JENKINS_URL")
  })

  it("throws when URL is set but no auth is provided", () => {
    process.env["MCP_JENKINS_URL"] = "https://jenkins.example.com"

    expect(() => loadAllJenkinsInstances({})).toThrow(
      "Missing Jenkins authentication",
    )
  })

  it("accepts bearer token auth without user/api-token", () => {
    process.env["MCP_JENKINS_URL"] = "https://jenkins.example.com"
    process.env["MCP_JENKINS_BEARER_TOKEN"] = "mybearer"

    const instances = loadAllJenkinsInstances({})
    const env = instances.values().next().value
    expect(env.JENKINS_BEARER_TOKEN).toBe("mybearer")
    expect(env.JENKINS_USER).toBeUndefined()
    expect(env.JENKINS_API_TOKEN).toBeUndefined()
  })

  it("derives instance name from URL hostname", () => {
    process.env["MCP_JENKINS_URL"] = "https://pipeline.yourcompany.com"
    process.env["MCP_JENKINS_USER"] = "admin"
    process.env["MCP_JENKINS_API_TOKEN"] = "token"

    const instances = loadAllJenkinsInstances({})
    expect(instances.has("pipeline")).toBe(true)
  })

  it("supports multiple instances via comma-separated values", () => {
    process.env["MCP_JENKINS_URL"] =
      "https://pipeline.example.com,https://scheduler.example.com"
    process.env["MCP_JENKINS_USER"] = "admin,admin"
    process.env["MCP_JENKINS_API_TOKEN"] = "token1,token2"

    const instances = loadAllJenkinsInstances({})
    expect(instances.size).toBe(2)
    expect(instances.has("pipeline")).toBe(true)
    expect(instances.has("scheduler")).toBe(true)
    expect(instances.get("scheduler")!.JENKINS_API_TOKEN).toBe("token2")
  })

  it("supports custom instance names via MCP_JENKINS_INSTANCES", () => {
    process.env["MCP_JENKINS_INSTANCES"] = "ci,prod"
    process.env["MCP_JENKINS_URL"] =
      "https://jenkins.example.com/ci,https://jenkins.example.com/prod"
    process.env["MCP_JENKINS_USER"] = "admin,admin"
    process.env["MCP_JENKINS_API_TOKEN"] = "token1,token2"

    const instances = loadAllJenkinsInstances({})
    expect(instances.has("ci")).toBe(true)
    expect(instances.has("prod")).toBe(true)
  })

  it("throws when instance count mismatches URL count", () => {
    process.env["MCP_JENKINS_INSTANCES"] = "ci,prod,staging"
    process.env["MCP_JENKINS_URL"] =
      "https://pipeline.example.com,https://scheduler.example.com"
    process.env["MCP_JENKINS_USER"] = "admin"
    process.env["MCP_JENKINS_API_TOKEN"] = "token"

    expect(() => loadAllJenkinsInstances({})).toThrow("counts must match")
  })

  it("anonymous single-instance accepts no user or token", () => {
    process.env["MCP_JENKINS_URL"] = "https://jenkins.example.com"
    process.env["MCP_JENKINS_ANONYMOUS"] = "true"

    const instances = loadAllJenkinsInstances({})
    const env = instances.values().next().value
    expect(env.JENKINS_ANONYMOUS).toBe(true)
    expect(env.JENKINS_USER).toBeUndefined()
    expect(env.JENKINS_API_TOKEN).toBeUndefined()
  })

  it("multi-instance positional anonymous flags apply per-instance", () => {
    process.env["MCP_JENKINS_URL"] =
      "https://pipeline.example.com,https://scheduler.example.com"
    process.env["MCP_JENKINS_ANONYMOUS"] = "true,false"
    process.env["MCP_JENKINS_USER"] = ",admin"
    process.env["MCP_JENKINS_API_TOKEN"] = ",token2"

    const instances = loadAllJenkinsInstances({})
    expect(instances.get("pipeline")!.JENKINS_ANONYMOUS).toBe(true)
    expect(instances.get("scheduler")!.JENKINS_ANONYMOUS).toBeUndefined()
  })

  it("cliArgs.jenkinsAnonymous takes precedence over MCP_JENKINS_ANONYMOUS env var", () => {
    process.env["MCP_JENKINS_URL"] = "https://jenkins.example.com"
    process.env["MCP_JENKINS_ANONYMOUS"] = "false"

    const instances = loadAllJenkinsInstances({ jenkinsAnonymous: true })
    const env = instances.values().next().value
    expect(env.JENKINS_ANONYMOUS).toBe(true)
  })
})

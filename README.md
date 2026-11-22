<div align="center">

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=node.js&logoColor=white)
![npm](https://img.shields.io/npm/v/@kud/mcp-jenkins?style=flat-square&color=CB3837)
![MIT](https://img.shields.io/badge/licence-MIT-22C55E?style=flat-square)

**Jenkins MCP server with bearer token authentication support**

<a href="https://kud.io/projects/mcp-jenkins">Website</a> · <a href="https://kud.io/projects/mcp-jenkins/docs">Documentation</a>

</div>

## Features

- **39 tools** — covers ~95% of the Jenkins API: jobs, builds, nodes, views, queue, plugins, and system operations
- **Bearer token auth** — supports both classic API token and modern bearer token authentication
- **Multiple instances** — connect to several Jenkins servers simultaneously using comma-separated env vars
- **Pipeline awareness** — retrieve stage-by-stage pipeline status, console logs, test results, and build artefacts
- **Failure diagnosis** — `jenkins_diagnose_build` reads a failed build in one screen: failing stages, the error lines from their logs, report links and failed tests
- **Node management** — list agents, toggle nodes online/offline, and inspect system info without leaving your AI client
- **Zero-install usage** — run directly via `npx --yes @kud/mcp-jenkins@latest` with no local setup required

## Install

```sh
npm install -g @kud/mcp-jenkins
```

Or use without installing via `npx` (see Usage below).

## Usage

Add the server to your MCP client config. The recommended approach uses environment variables:

```json
{
  "mcpServers": {
    "jenkins": {
      "command": "npx",
      "args": ["--yes", "@kud/mcp-jenkins@latest"],
      "env": {
        "MCP_JENKINS_URL": "https://pipeline.yourcompany.com",
        "MCP_JENKINS_USER": "your_username",
        "MCP_JENKINS_API_TOKEN": "your_api_token"
      }
    }
  }
}
```

For bearer token authentication, replace the env block with:

```json
"env": {
  "MCP_JENKINS_URL": "https://pipeline.yourcompany.com",
  "MCP_JENKINS_BEARER_TOKEN": "your_bearer_token"
}
```

### Slow instances

Every request this server makes is bounded by one deadline, **30 seconds** by default. A large or busy Jenkins can spend even longer answering a single call. When that happens, the error you see (`Jenkins request timed out`) comes from this server giving up, not from Jenkins refusing anything.

Raise it with `MCP_JENKINS_TIMEOUT_MS`:

```json
"env": {
  "MCP_JENKINS_URL": "https://pipeline.yourcompany.com",
  "MCP_JENKINS_BEARER_TOKEN": "your_bearer_token",
  "MCP_JENKINS_TIMEOUT_MS": "60000"
}
```

Or on the command line:

```sh
mcp-jenkins --url https://pipeline.yourcompany.com --bearer-token abc123 --timeout-ms 60000
```

One value applies to every configured instance. To find out what your instance actually needs, time the call the server makes:

```sh
time curl -u user:token 'https://pipeline.yourcompany.com/job/my-job/api/json'
```

### Read-only by default

Out of the box the server exposes only tools that read Jenkins. The tools that change it (trigger, stop, delete, replay, create, configure, rename, copy, enable/disable, cancel queue items, take nodes offline, quiet down, restart) are hidden from the tool list and refused if called by name.

Console logs, test reports and job descriptions are text that anyone able to influence a build can write, and the model reads that text. Keeping writes off means a single injected instruction cannot, for example, replay a build with a new pipeline script.

To expose every write tool:

```json
"env": {
  "MCP_JENKINS_URL": "https://pipeline.yourcompany.com",
  "MCP_JENKINS_BEARER_TOKEN": "your_bearer_token",
  "MCP_JENKINS_ALLOW_WRITE": "1"
}
```

To expose only some, name them in `MCP_JENKINS_ALLOW_TOOLS`: a write tool named there explicitly is exposed even without `MCP_JENKINS_ALLOW_WRITE`. With writes on, `MCP_JENKINS_BLOCK_TOOLS` hides individual tools again.

Four irreversible tools also refuse to run unless the call passes `confirm: true`: `jenkins_delete_job`, `jenkins_delete_build`, `jenkins_update_job_config` and `jenkins_replay_build`.

#### Migrating from 4.x

Until now every tool was exposed unless blocked. If you rely on write tools:

- set `MCP_JENKINS_ALLOW_WRITE=1` to keep them all, then drop from `MCP_JENKINS_BLOCK_TOOLS` anything that only served to make the server read-only;
- or list exactly the tools you need in `MCP_JENKINS_ALLOW_TOOLS`; an existing allowlist keeps working unchanged;
- calls to the four irreversible tools must now pass `confirm: true`.

A setup that blocked every write tool with `MCP_JENKINS_BLOCK_TOOLS` is now the default and can drop that variable.

### Environment variables

| Variable                   | Description                                                                       | Default          |
| -------------------------- | --------------------------------------------------------------------------------- | ---------------- |
| `MCP_JENKINS_URL`          | Jenkins server URL. Comma-separated to connect to several instances.              | Required         |
| `MCP_JENKINS_USER`         | Username for Basic auth, positional alongside the URL values.                     | None             |
| `MCP_JENKINS_API_TOKEN`    | API token for Basic auth, positional alongside the URL values.                    | None             |
| `MCP_JENKINS_BEARER_TOKEN` | Bearer token for token-based auth, instead of Basic auth.                         | None             |
| `MCP_JENKINS_ANONYMOUS`    | `true` for a Jenkins instance that needs no authentication.                       | `false`          |
| `MCP_JENKINS_TIMEOUT_MS`   | Per-request deadline in milliseconds, applied to every instance.                  | `30000`          |
| `MCP_JENKINS_INSTANCES`    | Comma-separated instance names, pairing each name with a URL position.            | Hostname per URL |
| `MCP_JENKINS_ALLOW_WRITE`  | `1` (or `true`, `yes`, `on`) to expose the tools that change Jenkins.             | Read-only        |
| `MCP_JENKINS_ALLOW_TOOLS`  | Comma-separated tool names: expose only these tools, write tools included.        | All read tools   |
| `MCP_JENKINS_BLOCK_TOOLS`  | Comma-separated tool names: hide these tools (ignored when the allowlist is set). | None             |

### Tools

| Category                | Tools                                                                                                                                                                                                                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Job operations**      | `jenkins_list_jobs`, `jenkins_search_jobs`, `jenkins_get_job_status`, `jenkins_get_job_parameters`, `jenkins_enable_job`, `jenkins_disable_job`, `jenkins_delete_job`, `jenkins_get_job_config`, `jenkins_create_job`, `jenkins_update_job_config`, `jenkins_rename_job`, `jenkins_copy_job` |
| **Build operations**    | `jenkins_get_build_status`, `jenkins_get_recent_builds`, `jenkins_trigger_build`, `jenkins_stop_build`, `jenkins_delete_build`, `jenkins_replay_build`, `jenkins_get_console_log`, `jenkins_get_build_changes`, `jenkins_get_pipeline_stages`, `jenkins_diagnose_build`                      |
| **Testing & artefacts** | `jenkins_get_test_results`, `jenkins_list_artifacts`, `jenkins_get_artifact`                                                                                                                                                                                                                 |
| **Queue management**    | `jenkins_get_queue`, `jenkins_cancel_queue`                                                                                                                                                                                                                                                  |
| **System & nodes**      | `jenkins_list_nodes`, `jenkins_get_node`, `jenkins_toggle_node_offline`, `jenkins_get_system_info`, `jenkins_get_version`, `jenkins_get_plugins`, `jenkins_quiet_down`, `jenkins_cancel_quiet_down`                                                                                          |
| **Views**               | `jenkins_list_views`, `jenkins_get_view`                                                                                                                                                                                                                                                     |
| **Instances & admin**   | `jenkins_list_instances`, `jenkins_safe_restart`                                                                                                                                                                                                                                             |

## Development

```sh
git clone https://github.com/kud/mcp-jenkins.git
cd mcp-jenkins
npm install
npm run dev
```

To test interactively with the MCP Inspector:

```sh
npm run inspect:dev
```

📚 **Full documentation → [mcp-jenkins/docs](https://kud.io/projects/mcp-jenkins/docs)**

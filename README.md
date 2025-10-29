# Jenkins MCP Server

```
     ██╗███████╗███╗   ██╗██╗  ██╗██╗███╗   ██╗███████╗    ███╗   ███╗ ██████╗██████╗
     ██║██╔════╝████╗  ██║██║ ██╔╝██║████╗  ██║██╔════╝    ████╗ ████║██╔════╝██╔══██╗
     ██║█████╗  ██╔██╗ ██║█████╔╝ ██║██╔██╗ ██║███████╗    ██╔████╔██║██║     ██████╔╝
██   ██║██╔══╝  ██║╚██╗██║██╔═██╗ ██║██║╚██╗██║╚════██║    ██║╚██╔╝██║██║     ██╔═══╝
╚█████╔╝███████╗██║ ╚████║██║  ██╗██║██║ ╚████║███████║    ██║ ╚═╝ ██║╚██████╗██║
 ╚════╝ ╚══════╝╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝╚══════╝    ╚═╝     ╚═╝ ╚═════╝╚═╝
```

<div align="center">

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green?logo=node.js&logoColor=white)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-1.0-purple?logo=anthropic)](https://modelcontextprotocol.io/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**A Jenkins MCP server with 25+ tools for managing jobs, builds, and CI/CD workflows**

[Features](#-features) • [Quick Start](#-quick-start) • [Installation](#-installation-guides) • [Tools](#-available-tools) • [Development](#-development)

</div>

---

## 🌟 Features

- **🔐 Flexible Authentication** - Bearer tokens, Basic auth, OAuth support
- **🛠️ 25+ Tools** - Complete Jenkins API coverage
- **⚡ Modern Stack** - TypeScript 5.3+, ES2023, Native Fetch API
- **📦 MCP Protocol** - Native integration with Claude Desktop, Claude Code CLI
- **🔄 Real-time Monitoring** - Build status, queue management, pipeline stages
- **🧪 Test Results** - View test pass/fail counts and suites
- **🎯 Job Control** - Enable/disable, trigger, stop, replay builds
- **📊 System Info** - Nodes, plugins, version info
- **🔍 Debug Tools** - MCP inspector for testing

---

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- Jenkins API token ([how to get one](#-authentication))

### Installation

**Option 1: Via npm (recommended once published):**

```bash
# No installation needed! Just use npx in your MCP config
npx @kud/mcp-jenkins
```

**Option 2: Local installation:**

```bash
git clone https://github.com/yourusername/mcp-jenkins.git
cd mcp-jenkins
npm install
npm run build
```

### Quick Setup Example (Claude CLI)

**If installed via npm:**
```bash
claude mcp add --transport stdio --scope user jenkins \
  --env JENKINS_URL=https://your-jenkins.com \
  --env JENKINS_USER=your_username \
  --env JENKINS_API_TOKEN=your_token \
  -- npx @kud/mcp-jenkins
```

**If installed locally:**
```bash
claude mcp add --transport stdio --scope user jenkins \
  --env JENKINS_URL=https://your-jenkins.com \
  --env JENKINS_USER=your_username \
  --env JENKINS_API_TOKEN=your_token \
  -- node ~/path/to/mcp-jenkins/dist/index.js
```

✅ Done! Now you can use Jenkins commands in your AI assistant.

---

## 📚 Installation Guides

Choose your development environment:

- [Claude Code CLI](#-claude-code-cli) - Command line interface
- [Claude Code Web](#-claude-code-web) - Browser-based Claude
- [Claude Desktop](#%EF%B8%8F-claude-desktop) - Desktop application
- [VSCode](#-vscode) - With Cline, Claude Dev, Continue
- [Cursor](#-cursor) - AI-first IDE
- [Windsurf](#-windsurf) - AI-powered code editor
- [GitHub Copilot](#-github-copilot) - In VSCode or standalone
- [GitHub Copilot CLI](#-github-copilot-cli) - Terminal tool
- [JetBrains IDEs](#-all-jetbrains-ides) - IntelliJ, WebStorm, PyCharm, GoLand, etc.

---

### 🎯 Claude Code CLI

**For:** Claude AI via command line interface

<details>
<summary><b>Click to expand Claude Code CLI setup</b></summary>

Add the Jenkins MCP server to Claude CLI:

**Via npm (recommended):**
```bash
claude mcp add --transport stdio --scope user jenkins \
  --env JENKINS_URL=https://pipeline.yourcompany.com \
  --env JENKINS_USER=your_username \
  --env JENKINS_API_TOKEN=your_api_token \
  -- npx @kud/mcp-jenkins
```

**Local installation:**
```bash
claude mcp add --transport stdio --scope user jenkins \
  --env JENKINS_URL=https://pipeline.yourcompany.com \
  --env JENKINS_USER=your_username \
  --env JENKINS_API_TOKEN=your_api_token \
  -- node $HOME/path/to/mcp-jenkins/dist/index.js
```

Verify: `claude mcp list` should show `jenkins`

</details>

---

### 🌐 Claude Code Web

**For:** Claude.ai in your browser

<details>
<summary><b>Click to expand Claude Web setup</b></summary>

**⚠️ Not supported.** Claude.ai web interface doesn't support custom MCP servers yet.

**Alternatives:**
- Use desktop clients (see below)
- Use CLI tools (see above)
- Test via MCP Inspector: `npm run inspect:dev` → `http://localhost:5173`

</details>

---

### 🖥️ Claude Desktop

**For:** Claude AI desktop application

<details>
<summary><b>Click to expand Claude Desktop setup</b></summary>

#### 1. Open Configuration File

**macOS:**
```bash
open ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

**Windows:**
```bash
notepad %APPDATA%\Claude\claude_desktop_config.json
```

#### 2. Add Configuration

**Via npm (recommended):**
```json
{
  "mcpServers": {
    "jenkins": {
      "command": "npx",
      "args": ["@kud/mcp-jenkins"],
      "env": {
        "JENKINS_URL": "https://pipeline.yourcompany.com",
        "JENKINS_USER": "your_username",
        "JENKINS_API_TOKEN": "your_api_token"
      }
    }
  }
}
```

**Local installation:**
```json
{
  "mcpServers": {
    "jenkins": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-jenkins/dist/index.js"],
      "env": {
        "JENKINS_URL": "https://pipeline.yourcompany.com",
        "JENKINS_USER": "your_username",
        "JENKINS_API_TOKEN": "your_api_token"
      }
    }
  }
}
```

#### 3. Restart

Quit (Cmd+Q / Alt+F4) and reopen Claude Desktop

</details>

---

### 📝 VSCode

**For:** VSCode with MCP-compatible extensions (Cline, Claude Dev, Continue)

<details>
<summary><b>Click to expand VSCode setup</b></summary>

**Cline:**

Settings (Cmd+, / Ctrl+,) → Search "Cline: MCP Settings" → Edit in settings.json:

```json
{
  "cline.mcpServers": {
    "jenkins": {
      "command": "npx",
      "args": ["@kud/mcp-jenkins"],
      "env": {
        "JENKINS_URL": "https://pipeline.yourcompany.com",
        "JENKINS_USER": "your_username",
        "JENKINS_API_TOKEN": "your_api_token"
      }
    }
  }
}
```

Or for local installation, use `"command": "node"` and `"args": ["/absolute/path/to/mcp-jenkins/dist/index.js"]`

**Claude Dev / Continue:**

Command Palette (Cmd+Shift+P) → "MCP: Edit Config" → Add similar configuration

Reload window after configuration

</details>

---


### 🌐 Cursor

**For:** Cursor IDE with built-in AI

<details>
<summary><b>Click to expand Cursor setup</b></summary>

Settings (Cmd+, / Ctrl+,) → Search "MCP" → Edit Config or open `~/.cursor/mcp_config.json`:

```json
{
  "mcpServers": {
    "jenkins": {
      "command": "npx",
      "args": ["@kud/mcp-jenkins"],
      "env": {
        "JENKINS_URL": "https://pipeline.yourcompany.com",
        "JENKINS_USER": "your_username",
        "JENKINS_API_TOKEN": "your_api_token"
      }
    }
  }
}
```

Or for local installation, use `"command": "node"` and `"args": ["/absolute/path/to/mcp-jenkins/dist/index.js"]`

Restart Cursor (Cmd+Q / Alt+F4) after configuration

</details>

---

### 🌊 Windsurf

**For:** Windsurf AI-powered code editor

<details>
<summary><b>Click to expand Windsurf setup</b></summary>

Settings → **AI Settings** → **Model Context Protocol** → Add Server:

```json
{
  "mcpServers": {
    "jenkins": {
      "command": "npx",
      "args": ["@kud/mcp-jenkins"],
      "env": {
        "JENKINS_URL": "https://pipeline.yourcompany.com",
        "JENKINS_USER": "your_username",
        "JENKINS_API_TOKEN": "your_api_token"
      }
    }
  }
}
```

Or edit `~/.windsurf/mcp_settings.json` directly. For local installation, use `"command": "node"` with full path.

Restart Windsurf after configuration.

</details>

---

### 🤖 GitHub Copilot

**For:** GitHub Copilot in VSCode or other editors

<details>
<summary><b>Click to expand GitHub Copilot setup</b></summary>

**⚠️ Not supported.** GitHub Copilot doesn't support MCP servers.

**Options:**
- **In VSCode:** Install Copilot + Cline/Claude Dev. Use Copilot for coding, Cline/Claude Dev for Jenkins (see VSCode section)
- **In terminal:** Use Copilot for coding suggestions, an MCP-compatible CLI for Jenkins (see CLI sections above)
- **No MCP:** Use code in `src/lib/jenkins-client.ts` as examples for direct API calls

</details>

---

### 💻 GitHub Copilot CLI

**For:** New GitHub Copilot CLI (`@github/copilot`) in your terminal

<details>
<summary><b>Click to expand GitHub Copilot CLI setup</b></summary>

**Note:** This is for the NEW Copilot CLI (`npm install -g @github/copilot`), not the old `gh copilot` extension.

#### Option 1: Config File

Create or edit `~/.copilot/mcp-config.json`:

```json
{
  "mcpServers": {
    "jenkins": {
      "command": "npx",
      "args": ["@kud/mcp-jenkins"],
      "env": {
        "JENKINS_URL": "https://pipeline.yourcompany.com",
        "JENKINS_USER": "your_username",
        "JENKINS_API_TOKEN": "your_api_token"
      }
    }
  }
}
```

Then run: `copilot`

#### Option 2: Inline Config

Pass MCP config directly via command line:

```bash
copilot --additional-mcp-config '{
  "mcpServers": {
    "jenkins": {
      "command": "npx",
      "args": ["@kud/mcp-jenkins"],
      "env": {
        "JENKINS_URL": "https://pipeline.yourcompany.com",
        "JENKINS_USER": "your_username",
        "JENKINS_API_TOKEN": "your_api_token"
      }
    }
  }
}'
```

Or save to a file and reference it:

```bash
# Save config to jenkins-mcp.json
copilot --additional-mcp-config @jenkins-mcp.json
```

For local installation, use `"command": "node"` with `"args": ["/absolute/path/to/mcp-jenkins/dist/index.js"]`

#### Option 3: Allow All Tools (Non-Interactive)

For scripts and automation:

```bash
copilot --allow-all-tools -p "Check status of mobile-pipeline build"
```

</details>

---

### 🔧 All JetBrains IDEs

**For:** IntelliJ IDEA, WebStorm, PyCharm, GoLand, RubyMine, PhpStorm, Rider, CLion, DataGrip

<details>
<summary><b>Click to expand JetBrains IDEs setup</b></summary>

Settings (Cmd+, / Ctrl+,) → **Tools** → **AI Assistant** → **Model Context Protocol** → Add Server:

- **Name:** Jenkins
- **Command:** `npx`
- **Arguments:** `@kud/mcp-jenkins`
- **Environment Variables:**
  ```
  JENKINS_URL=https://pipeline.yourcompany.com
  JENKINS_USER=your_username
  JENKINS_API_TOKEN=your_api_token
  ```

For local installation, use **Command:** `node` and **Arguments:** `/absolute/path/to/mcp-jenkins/dist/index.js`

Apply and restart the IDE.

**Alternative:** If MCP not available, use MCP-compatible CLI from built-in terminal (Alt+F12 / ⌥F12)

**Notes:**
- Ultimate/Professional editions: Full AI Assistant MCP support
- Community editions: Use MCP-compatible CLI from terminal instead

</details>

---

## 🛠️ Available Tools

### 📋 Job Operations (5 tools)

| Tool | Description |
|------|-------------|
| `jenkins_list_jobs` | List all Jenkins jobs |
| `jenkins_search_jobs` | Search jobs by name |
| `jenkins_get_job_status` | Get last build status |
| `jenkins_enable_job` | Enable a disabled job |
| `jenkins_disable_job` | Disable a job |
| `jenkins_delete_job` | Delete a job (⚠️ permanent) |
| `jenkins_get_job_config` | Get job XML configuration |

### 🔨 Build Operations (9 tools)

| Tool | Description |
|------|-------------|
| `jenkins_get_build_status` | Get specific build status |
| `jenkins_get_recent_builds` | Get recent builds (last N) |
| `jenkins_trigger_build` | Trigger a new build |
| `jenkins_stop_build` | Stop/abort running build |
| `jenkins_delete_build` | Delete a build |
| `jenkins_replay_build` | Replay a pipeline build |
| `jenkins_get_console_log` | Get build console output |
| `jenkins_get_build_changes` | Get Git commits for build |
| `jenkins_get_pipeline_stages` | Get pipeline stage status |

### 🧪 Testing & Artifacts (3 tools)

| Tool | Description |
|------|-------------|
| `jenkins_get_test_results` | Get test pass/fail counts |
| `jenkins_list_artifacts` | List build artifacts |
| `jenkins_get_artifact` | Download artifact (base64) |

### 📊 Queue Management (2 tools)

| Tool | Description |
|------|-------------|
| `jenkins_get_queue` | View pending builds |
| `jenkins_cancel_queue` | Cancel queued build |

### 🖥️ System Information (5 tools)

| Tool | Description |
|------|-------------|
| `jenkins_list_nodes` | List all agents/nodes |
| `jenkins_get_system_info` | Get Jenkins system info |
| `jenkins_get_version` | Get Jenkins version |
| `jenkins_get_plugins` | List installed plugins |

**Total: 25 Tools** covering ~90% of Jenkins API operations!

---

## 💬 Example Conversations

Once configured, interact with Jenkins naturally:

```
You: "List all my Jenkins jobs"
AI: *Shows list of all jobs*

You: "What's the status of the 'api-backend' build?"
AI: *Shows latest build status, duration, result*

You: "Get the test results for build #42 of 'mobile-pipeline'"
AI: *Shows pass/fail counts, test suites*

You: "Show me the pipeline stages for that failed build"
AI: *Shows which stage failed and durations*

You: "Trigger a build for 'deploy-staging' with VERSION=2.1.0"
AI: *Triggers build with parameters*

You: "Stop build #966 of 'mobile-pipeline'"
AI: *Stops the running build*

You: "Show me the queue"
AI: *Lists all pending builds*

You: "What version of Jenkins are we running?"
AI: *Shows Jenkins version*
```

---

## 🧪 Development

### Project Structure

```
mcp-jenkins/
├── src/
│   ├── common/              # Shared utilities
│   │   ├── env.ts           # Environment config
│   │   ├── errors.ts        # Error handling
│   │   ├── http.ts          # HTTP client (native fetch)
│   │   ├── logger.ts        # JSON logging
│   │   └── index.ts         # Exports
│   ├── lib/
│   │   └── jenkins-client.ts  # Jenkins API client
│   ├── tools/               # 25 MCP tool implementations
│   │   ├── get-job-status.ts
│   │   ├── trigger-build.ts
│   │   ├── get-test-results.ts
│   │   ├── stop-build.ts
│   │   └── ... (21 more)
│   └── index.ts             # MCP server entrypoint
├── dist/                    # Compiled output
├── package.json
├── tsconfig.json
└── README.md
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run build:watch` | Watch mode - rebuild on changes |
| `npm run dev` | Run in development (tsx) |
| `npm start` | Run compiled server |
| `npm run inspect` | Open MCP inspector |
| `npm run inspect:dev` | Inspector in dev mode (no build) |
| `npm run typecheck` | Type check without building |
| `npm run clean` | Remove build artifacts |

### Development Workflow

```bash
# Terminal 1: Watch mode
npm run build:watch

# Terminal 2: Test with inspector
npm run inspect:dev
```

### Testing with MCP Inspector

```bash
export JENKINS_URL=https://pipeline.yourcompany.com
export JENKINS_USER=your_username
export JENKINS_API_TOKEN=your_token

npm run inspect:dev
```

Opens `http://localhost:5173` - test all tools interactively!

### Adding New Tools

1. Create tool file in `src/tools/`:

```typescript
// src/tools/my-new-tool.ts
import { JenkinsClient } from '../lib/jenkins-client.js';

export interface MyToolInput {
  someParam: string;
}

export const myNewTool = async (client: JenkinsClient, input: MyToolInput) => {
  // Implementation
  return { result: 'success' };
};
```

2. Add method to `JenkinsClient` (src/lib/jenkins-client.ts)

3. Register in `src/index.ts`:
   - Import the tool
   - Add to `tools` array
   - Add to `toolHandlers` map

4. Rebuild:
```bash
npm run build
```

---

## 🔐 Authentication

### Get Your Jenkins API Token

Follow these steps to create an API token for the MCP server:

#### Step 1: Access Security Settings
1. Log in to your Jenkins instance
2. Click your **username** in the top-right corner
3. Select **Configure** from the dropdown menu
4. In the left sidebar, click **Security**

#### Step 2: Create API Token
1. Scroll to the **API Token** section
2. Under "Current token(s)", click the **Add new token** button
3. Enter a descriptive name (e.g., "Jenkins MCP" or "AI Assistant")
4. Click **Generate**
5. **⚠️ IMPORTANT:** Copy the token immediately - it will only be shown once!

#### Step 3: Save the Token
Store the token securely - you'll need it for configuration:
- For Bearer Token auth: Use it as `JENKINS_BEARER_TOKEN`
- For Basic auth: Use it as `JENKINS_API_TOKEN` (along with `JENKINS_USER`)

**Example token format:** `11abcd1234567890abcdef1234567890ab`

> 💡 **Tip:** You can see all your active tokens in the "Current token(s)" list. Each shows when it was created and last used, helping you manage and rotate tokens regularly.

### Bearer Token vs Basic Auth

**Bearer Token (Recommended):**
```bash
--env JENKINS_BEARER_TOKEN=your_token
```

**Basic Auth:**
```bash
--env JENKINS_USER=your_username
--env JENKINS_API_TOKEN=your_token
```

### OAuth Support

This server forwards any `Authorization` header to Jenkins. If your Jenkins uses OAuth (via plugins), just pass the OAuth token as `JENKINS_BEARER_TOKEN`.

---

## 🐛 Troubleshooting

### Server Not Showing in Claude

1. ✅ Check path is absolute
2. ✅ Run `npm install && npm run build`
3. ✅ Verify environment variables
4. ✅ Restart Claude completely

### Authentication Errors

```bash
# Test your credentials
curl -u username:token https://your-jenkins.com/api/json
```

If this returns JSON, your credentials are valid!

### Build Errors

```bash
# Clean rebuild
npm run clean && npm run build
```

### Check Logs

**Claude Desktop logs:**
- macOS: `~/Library/Logs/Claude/mcp*.log`
- Windows: `%APPDATA%\Claude\logs\mcp*.log`

**Claude Code CLI logs:**
```bash
claude mcp get jenkins
```

---

## 🔒 Security Best Practices

- ✅ Use environment variables (never hardcode tokens)
- ✅ Use bearer tokens over basic auth when possible
- ✅ Rotate tokens regularly
- ✅ Use restricted tokens (limit permissions in Jenkins)
- ✅ Never commit tokens to version control
- ✅ Protect config files (`claude_desktop_config.json`)

---

## 📊 Tech Stack

- **Runtime:** Node.js 20+
- **Language:** TypeScript 5.3+
- **Target:** ES2023
- **Protocol:** MCP 1.0 (stdio transport)
- **HTTP Client:** Native Fetch API
- **Module System:** ESM

---

## 🤝 Contributing

Contributions welcome! Please ensure:

1. TypeScript strict mode compliance
2. All tools properly typed
3. Build passes: `npm run build`
4. Tools registered in both `tools` array and `toolHandlers`

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file

---

## 🙏 Acknowledgments

- Built with [Model Context Protocol](https://modelcontextprotocol.io/)
- Jenkins REST API by [Jenkins Project](https://www.jenkins.io/)

---

## 📮 Support

- 🐛 **Issues:** [GitHub Issues](https://github.com/yourusername/mcp-jenkins/issues)
- 💬 **Discussions:** [GitHub Discussions](https://github.com/yourusername/mcp-jenkins/discussions)

---

<div align="center">

**Made with ❤️ for the DevOps & AI community**

⭐ Star this repo if it helped you!

[Back to Top](#jenkins-mcp-server)

</div>

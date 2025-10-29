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
- **🔄 Real-time** - Build status, queue management, pipeline stages
- **🧪 Test Results** - View test pass/fail counts and suites
- **🎯 Job Control** - Enable/disable, trigger, stop, replay builds
- **📊 System Monitoring** - Nodes, plugins, version info
- **🔍 Debug Tools** - MCP inspector for interactive testing

---

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- Jenkins API token ([how to get one](#get-your-jenkins-api-token))

### Installation

```bash
# Clone or download this repository
cd mcp-jenkins

# Install dependencies
npm install

# Build
npm run build
```

### Configure with Claude Code CLI (Recommended)

```bash
claude mcp add --transport stdio --scope user jenkins \
  --env JENKINS_URL=https://your-jenkins.com \
  --env JENKINS_USER=your_username \
  --env JENKINS_API_TOKEN=your_token \
  -- node ~/path/to/mcp-jenkins/dist/index.js
```

✅ Done! Now you can use Jenkins commands in Claude.

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

#### 1. Install Claude Code CLI

```bash
# macOS/Linux
curl -fsSL https://cli.claude.com/install.sh | sh

# Or via npm
npm install -g @anthropic-ai/claude-code
```

#### 2. Verify Installation

```bash
claude --version
```

#### 3. Add Jenkins MCP Server

**With Bearer Token:**
```bash
claude mcp add --transport stdio --scope user jenkins \
  --env JENKINS_URL=https://pipeline.yourcompany.com \
  --env JENKINS_BEARER_TOKEN=your_bearer_token \
  -- node $HOME/path/to/mcp-jenkins/dist/index.js
```

**With Basic Auth:**
```bash
claude mcp add --transport stdio --scope user jenkins \
  --env JENKINS_URL=https://pipeline.yourcompany.com \
  --env JENKINS_USER=your_username \
  --env JENKINS_API_TOKEN=your_api_token \
  -- node $HOME/path/to/mcp-jenkins/dist/index.js
```

#### 4. Verify Setup

```bash
claude mcp list
```

You should see `jenkins` in the list.

#### 5. Test It

```bash
claude
```

Then ask: "List all Jenkins jobs"

</details>

---

### 🌐 Claude Code Web

**For:** Claude.ai in your browser

<details>
<summary><b>Click to expand Claude Web setup</b></summary>

**⚠️ Note:** Claude Code Web (claude.ai) doesn't support custom MCP servers yet. MCP servers currently only work with:
- Claude Desktop app
- Claude Code CLI
- IDEs with MCP-compatible extensions (VSCode, Cursor, etc.)

**Workaround Options:**

#### Option 1: Use Claude Desktop Instead
Switch to Claude Desktop app which has full MCP support (see section below)

#### Option 2: Use Claude CLI for Jenkins, Web for Chat
1. Configure Claude CLI with Jenkins MCP (see Claude Code CLI section)
2. Use `claude` command for Jenkins operations
3. Copy/paste responses into Claude Web for further discussion

#### Option 3: Use MCP Inspector for Testing
```bash
npm run inspect:dev
```
This opens a web UI at `http://localhost:5173` where you can test all Jenkins tools interactively

</details>

---

### 🖥️ Claude Desktop

**For:** Claude AI desktop application

<details>
<summary><b>Click to expand Claude Desktop setup</b></summary>

#### 1. Get Your Jenkins API Token

See the [Authentication section](#-authentication) below for detailed step-by-step instructions with screenshots on how to create your Jenkins API token.

#### 2. Open Configuration File

**macOS:**
```bash
open ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

**Windows:**
```bash
notepad %APPDATA%\Claude\claude_desktop_config.json
```

#### 3. Add Configuration

**With Bearer Token:**
```json
{
  "mcpServers": {
    "jenkins": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-jenkins/dist/index.js"],
      "env": {
        "JENKINS_URL": "https://pipeline.yourcompany.com",
        "JENKINS_BEARER_TOKEN": "your_jenkins_api_token"
      }
    }
  }
}
```

**With Basic Auth:**
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

#### 4. Restart Claude Desktop

Completely quit (Cmd+Q on Mac) and reopen Claude Desktop.

#### 5. Verify

Ask Claude: "List all Jenkins jobs"

</details>

---

### 📝 VSCode

**For:** VSCode with MCP-compatible extensions (Cline, Claude Dev, etc.)

<details>
<summary><b>Click to expand VSCode setup</b></summary>

#### 1. Install an MCP-Compatible Extension

Choose one:
- **Cline** (recommended) - Search for "Cline" in VSCode extensions
- **Claude Dev** - Search for "Claude Dev" in VSCode extensions
- **Continue** - Search for "Continue" in VSCode extensions

#### 2. Configure MCP Server

**For Cline:**
1. Open Settings (Cmd+, / Ctrl+,)
2. Search for "Cline: MCP Settings"
3. Click "Edit in settings.json"
4. Add:

```json
{
  "cline.mcpServers": {
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

**For Claude Dev or Continue:**
1. Open Command Palette (Cmd+Shift+P / Ctrl+Shift+P)
2. Type: "MCP: Edit Config" or "Open MCP Settings"
3. Add similar configuration

#### 3. Reload VSCode

Press Cmd+Shift+P / Ctrl+Shift+P → "Reload Window"

#### 4. Test

Open your AI assistant panel and ask: "List all Jenkins jobs"

</details>

---


### 🌐 Cursor

**For:** Cursor IDE with built-in AI

<details>
<summary><b>Click to expand Cursor setup</b></summary>

#### 1. Install Cursor

Download from [cursor.sh](https://cursor.sh)

#### 2. Configure MCP Server

1. Open Cursor Settings (Cmd+, / Ctrl+,)
2. Search for "MCP" or go to **Features** → **Model Context Protocol**
3. Click **Edit Config** or open `~/.cursor/mcp_config.json`
4. Add configuration:

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

#### 3. Restart Cursor

Completely quit (Cmd+Q / Alt+F4) and reopen Cursor

#### 4. Test

Open Cursor AI chat (Cmd+L / Ctrl+L) and ask: "List all Jenkins jobs"

</details>

---

### 🌊 Windsurf

**For:** Windsurf AI-powered code editor

<details>
<summary><b>Click to expand Windsurf setup</b></summary>

#### 1. Install Windsurf

Download from [codeium.com/windsurf](https://codeium.com/windsurf)

#### 2. Configure MCP Server

1. Open Windsurf Settings
2. Navigate to **AI Settings** → **Model Context Protocol**
3. Click **Add Server**
4. Configure:

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

Or edit `~/.windsurf/mcp_settings.json` directly

#### 3. Restart Windsurf

Completely quit and reopen Windsurf

#### 4. Test

Open Windsurf AI chat and ask: "List all Jenkins jobs"

</details>

---

### 🤖 GitHub Copilot

**For:** GitHub Copilot in VSCode or other editors

<details>
<summary><b>Click to expand GitHub Copilot setup</b></summary>

**⚠️ Note:** GitHub Copilot doesn't directly support MCP servers. Here are your options:

#### Option 1: Use VSCode with Copilot + Claude Code Extension

1. Install both **GitHub Copilot** and **Claude Dev** (or **Cline**) in VSCode
2. Configure MCP server for Claude Dev (see VSCode section above)
3. Use:
   - **Copilot** for code completion (Ctrl+I / Cmd+I)
   - **Claude/Cline** for Jenkins operations (via MCP)

#### Option 2: Use Claude CLI in Terminal Alongside Copilot

1. Install Claude CLI:
```bash
npm install -g @anthropic-ai/claude-code
```

2. Configure Jenkins MCP:
```bash
claude mcp add --transport stdio --scope user jenkins \
  --env JENKINS_URL=https://pipeline.yourcompany.com \
  --env JENKINS_USER=your_username \
  --env JENKINS_API_TOKEN=your_api_token \
  -- node ~/path/to/mcp-jenkins/dist/index.js
```

3. Use:
   - **Copilot** in your editor for coding
   - **Claude CLI** in terminal for Jenkins: `claude` then ask "List all Jenkins jobs"

#### Option 3: Copilot Chat + Manual REST Calls (No MCP)

Use this MCP server as a reference and make direct Jenkins API calls via Copilot Chat:
- Ask Copilot Chat: "How do I call the Jenkins API to list all jobs?"
- Use the client code in `src/lib/jenkins-client.ts` as examples

</details>

---

### 💻 GitHub Copilot CLI

**For:** GitHub Copilot in your terminal

<details>
<summary><b>Click to expand GitHub Copilot CLI setup</b></summary>

**⚠️ Note:** GitHub Copilot CLI (`gh copilot`) doesn't support MCP servers.

**Recommended Approach: Use Both Tools**

1. **Install GitHub Copilot CLI:**
```bash
gh extension install github/gh-copilot
```

2. **Install Claude CLI with Jenkins MCP:**
```bash
# Install Claude CLI
npm install -g @anthropic-ai/claude-code

# Add Jenkins MCP
claude mcp add --transport stdio --scope user jenkins \
  --env JENKINS_URL=https://pipeline.yourcompany.com \
  --env JENKINS_USER=your_username \
  --env JENKINS_API_TOKEN=your_api_token \
  -- node ~/path/to/mcp-jenkins/dist/index.js
```

3. **Use them together:**
```bash
# For general coding questions
gh copilot suggest "create a bash script that..."

# For Jenkins operations
claude
# Then ask: "List all Jenkins jobs"
# or: "Check status of mobile-pipeline"
```

4. **Create a helper alias (optional):**

Add to `~/.zshrc` or `~/.bashrc`:
```bash
alias jenkins="claude --prompt 'You are a Jenkins assistant. Help me with:'"
```

Then use:
```bash
jenkins "What's the status of my builds?"
```

</details>

---

### 🔧 All JetBrains IDEs

**For:** IntelliJ IDEA, WebStorm, PyCharm, GoLand, RubyMine, PhpStorm, Rider, CLion, DataGrip

<details>
<summary><b>Click to expand JetBrains IDEs setup</b></summary>

All JetBrains IDEs share the same AI Assistant configuration:

#### 1. Install AI Assistant

1. Open **Settings/Preferences** (Cmd+, / Ctrl+,)
2. Go to **Plugins**
3. Search for **"AI Assistant"**
4. Install and restart IDE

#### 2. Configure MCP Server

1. Open **Settings** (Cmd+, / Ctrl+,)
2. Go to **Tools** → **AI Assistant** → **Model Context Protocol**
3. Click **Add Server** or the **+** button
4. Configure:
   - **Name:** Jenkins
   - **Command:** `node`
   - **Arguments:** `/absolute/path/to/mcp-jenkins/dist/index.js`
   - **Environment Variables:**
     ```
     JENKINS_URL=https://pipeline.yourcompany.com
     JENKINS_USER=your_username
     JENKINS_API_TOKEN=your_api_token
     ```

#### 3. Save and Restart

Click **Apply** → **OK** and restart the IDE

#### 4. Test

1. Open AI Assistant panel (typically in sidebar or via View → Tool Windows → AI Assistant)
2. Ask: "List all Jenkins jobs"

#### Alternative: Use Claude CLI from Built-in Terminal

If your JetBrains IDE version doesn't support MCP yet:

1. Configure Claude CLI (see [Claude Code CLI section](#-claude-code-cli))
2. Open Terminal in your IDE (Alt+F12 / ⌥F12)
3. Run: `claude`
4. Ask Jenkins questions

#### IDE-Specific Notes:

- **IntelliJ IDEA Ultimate**: Full AI Assistant support
- **IntelliJ IDEA Community**: Limited AI features, use Claude CLI from terminal
- **WebStorm**: Full AI Assistant support
- **PyCharm Professional**: Full AI Assistant support
- **PyCharm Community**: Limited AI features, use Claude CLI from terminal
- **Other JetBrains IDEs**: Most professional editions support AI Assistant

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
Claude: *Shows list of all jobs*

You: "What's the status of the 'api-backend' build?"
Claude: *Shows latest build status, duration, result*

You: "Get the test results for build #42 of 'mobile-pipeline'"
Claude: *Shows pass/fail counts, test suites*

You: "Show me the pipeline stages for that failed build"
Claude: *Shows which stage failed and durations*

You: "Trigger a build for 'deploy-staging' with VERSION=2.1.0"
Claude: *Triggers build with parameters*

You: "Stop build #966 of 'mobile-pipeline'"
Claude: *Stops the running build*

You: "Show me the queue"
Claude: *Lists all pending builds*

You: "What version of Jenkins are we running?"
Claude: *Shows Jenkins version*
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
3. Enter a descriptive name (e.g., "Jenkins MCP" or "Claude AI")
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
- Powered by [Anthropic Claude](https://anthropic.com/claude)
- Jenkins REST API by [Jenkins Project](https://www.jenkins.io/)

---

## 📮 Support

- 🐛 **Issues:** [GitHub Issues](https://github.com/yourusername/mcp-jenkins/issues)
- 💬 **Discussions:** [GitHub Discussions](https://github.com/yourusername/mcp-jenkins/discussions)

---

<div align="center">

**Made with ❤️ for the Jenkins & AI community**

⭐ Star this repo if it helped you!

[Back to Top](#jenkins-mcp-server)

</div>

# MCP Bridge API

## A Lightweight, LLM-Agnostic RESTful Proxy for Model Context Protocol Servers

**Authors:**  
[Arash Ahmadi](https://github.com/Arash-san), [Sarah S. Sharif](https://www.ou.edu/coe/ece/faculty_directory/safura-sharifi), and [Yaser M. Banad](https://www.ou.edu/coe/ece/faculty_directory/banad_mike)*  
School of Electrical, and Computer Engineering, University of Oklahoma, Oklahoma, United States  
*Corresponding author: bana@ou.edu

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## 📚 Introduction

MCP Bridge is a lightweight, fast, and LLM-agnostic proxy that connects to multiple Model Context Protocol (MCP) servers and exposes their capabilities through a unified REST API. It enables any client on any platform to leverage MCP functionality without process execution constraints. Unlike Anthropic's official MCP SDK, MCP Bridge is fully independent and designed to work with any LLM backend which makes it adaptable, modular, and future-proof for diverse deployments. With optional risk-based execution levels, it provides granular security controls—from standard execution to confirmation workflows and Docker isolation—while maintaining backward compatibility with standard MCP clients. Complementing this server-side infrastructure is the MCP-Gemini Agent, a Python client that integrates Google's Gemini API with MCP Bridge. This agent enables natural language interaction with MCP tools through an intelligent LLM-powered interface that features multi-step reasoning for complex operations, security confirmation workflow handling, and configurable display options for enhanced usability. Together, MCP Bridge's versatile server-side capabilities and the Gemini Agent's intelligent client interface create a powerful ecosystem for developing sophisticated LLM-powered applications.

### ⚠️ The Problem

- Many MCP servers use STDIO transports requiring local process execution
- Edge devices, mobile devices, web browsers, and other platforms cannot efficiently run npm or Python MCP servers
- Direct MCP server connections are impractical in resource-constrained environments
- Multiple isolated clients connecting to the same servers causes redundancy and increases resource usage
- Interacting directly with MCP tools requires technical knowledge of specific tool formats and requirements

## 📑 Table of Contents

- [Architecture](#️-architecture)
- [Installation](#-installation)
  - [Prerequisites](#-prerequisites)
  - [Quick Setup](#-quick-setup)
- [Configuration](#️-configuration)
  - [MCP Bridge Configuration](#mcp-bridge-configuration)
  - [MCP-Gemini Agent Configuration](#mcp-gemini-agent-configuration)
- [API Usage](#-api-usage)
  - [General Endpoints](#-general-endpoints)
  - [Server-Specific Endpoints](#-server-specific-endpoints)
- [Example Requests](#-example-requests)
- [MCP-Gemini Agent Features](#-mcp-gemini-agent-features)
- [Risk Levels](#-risk-levels)
  - [Risk Level Classification](#risk-level-classification)
  - [Configuring Risk Levels](#configuring-risk-levels)
  - [Risk Level Workflows](#risk-level-workflows)
- [Deployment Considerations](#-deployment-considerations)
  - [Security](#-security)
  - [Scaling](#-scaling)
- [Comparison with Other MCP Bridge/Proxy Repositories](#-comparison-with-other-mcp-bridgeproxy-repositories)
- [License](#-license)

## 🏗️ Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     Mobile      │     │     Browser     │     │  Other Clients  │
│    Application  │     │   Application   │     │                 │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │                       │                       │
         │                       ▼                       │
         │           ┌───────────────────────┐          │
         └──────────►│                       │◄─────────┘
                     │      REST API         │
                     │                       │
                     └───────────┬───────────┘
                                 │
                                 ▼
                     ┌───────────────────────┐
                     │                       │
                     │     MCP Bridge        │
                     │                       │
                     └───────────┬───────────┘
                                 │
                 ┌───────────────┼───────────────┐
                 │               │               │
                 ▼               ▼               ▼
        ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
        │  MCP Server │  │  MCP Server │  │  MCP Server │
        │    (STDIO)  │  │    (STDIO)  │  │    (SSE)    │
        └─────────────┘  └─────────────┘  └─────────────┘
```

## 💾 Installation

### 📦 Prerequisites

- Node.js 18+ for MCP Bridge
- Python 3.8+ for the MCP-Gemini Agent

### 🚀 Quick Setup

#### MCP Bridge

```bash
# Install dependencies
npm install express cors morgan uuid

# Start the server
node mcp-bridge.js
```

#### MCP-Gemini Agent

```bash
# Install dependencies
pip install google-generativeai requests rich

# Start the agent
python llm_test.py
```

## ⚙️ Configuration

### MCP Bridge Configuration

MCP Bridge is configured through a JSON file named `mcp_config.json` in the project root. This is an example of a basic MCP config:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/directory"],
      "riskLevel": 2
    },
    "slack": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-slack"],
      "env": {
        "SLACK_BOT_TOKEN": "your-slack-token",
        "SLACK_TEAM_ID": "your-team-id"
      },
      "riskLevel": 1
    }
  }
}
```

### MCP-Gemini Agent Configuration

The MCP-Gemini Agent supports several command-line options:

```
usage: llm_test.py [-h] [--hide-json] [--json-width JSON_WIDTH] [--mcp-url MCP_URL] [--mcp-port MCP_PORT]

MCP-Gemini Agent with configurable settings

options:
  -h, --help            show this help message and exit
  --hide-json           Hide JSON results from tool executions
  --json-width JSON_WIDTH
                        Maximum width for JSON output (default: 100)
  --mcp-url MCP_URL     MCP Bridge URL including protocol and port (default: http://localhost:3000)
  --mcp-port MCP_PORT   Override port in MCP Bridge URL (default: use port from --mcp-url)
```

## 🧪 API Usage

MCP Bridge exposes a clean and intuitive REST API for interacting with connected servers. Here's a breakdown of available endpoints:

### 📋 General Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/servers` | GET | List all connected MCP servers |
| `/servers` | POST | Start a new MCP server |
| `/servers/{serverId}` | DELETE | Stop and remove an MCP server |
| `/health` | GET | Get health status of the MCP Bridge |
| `/confirmations/{confirmationId}` | POST | Confirm execution of a medium risk level request |

### 📌 Server-Specific Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/servers/{serverId}/tools` | GET | List all tools for a specific server |
| `/servers/{serverId}/tools/{toolName}` | POST | Execute a specific tool |
| `/servers/{serverId}/resources` | GET | List all resources |
| `/servers/{serverId}/resources/{resourceUri}` | GET | Retrieve specific resource content |
| `/servers/{serverId}/prompts` | GET | List all prompts |
| `/servers/{serverId}/prompts/{promptName}` | POST | Execute a prompt with arguments |

## 🧪 Example Requests

### 📂 Read Directory (Filesystem)

```http
POST /servers/filesystem/tools/list_directory
Content-Type: application/json

{
  "path": "."
}
```

## 🧪 MCP-Gemini Agent Features

The MCP-Gemini Agent is a Python-based client that connects to MCP Bridge Node.JS server and uses Google's Gemini LLM to process user requests and execute MCP tools commands. Key features:

1. **Multi-step reasoning** - Supports sequenced tool calls for complex operations
2. **Security confirmation flow** - Integrated handling for medium and high risk operations
3. **Flexible JSON display** - Control the verbosity of JSON outputs for better readability
4. **Configurable connection** - Connect to any MCP Bridge instance with custom URL and port
5. **Discovery of available tools** - Automatically detects and uses all tools from connected servers

Example usage:

```bash
# Basic usage with default settings
python llm_test.py

# Hide JSON results for cleaner output
python llm_test.py --hide-json

# Connect to a custom MCP Bridge server
python llm_test.py --mcp-url http://192.168.1.100:3000

# Connect to a different port
python llm_test.py --mcp-port 4000

# Adjust JSON width display for better formatting
python llm_test.py --json-width 120
```

## 🔐 Risk Levels

MCP Bridge implements an optional risk level system that provides control over server execution behaviors. Risk levels help manage security and resource concerns when executing potentially sensitive MCP server operations.

### Risk Level Classification

| Level | Name | Description | Behavior |
|-------|------|-------------|----------|
| 1 | Low | Standard execution | Direct execution without confirmation |
| 2 | Medium | Requires confirmation | Client must confirm execution before processing |
| 3 | High | Docker execution required | Server runs in isolated Docker container |

### Configuring Risk Levels

Risk levels are optional for backward compatibility. You can configure risk levels in your `mcp_config.json`:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/directory"],
      "riskLevel": 2
    },
    "slack": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-slack"],
      "env": {
        "SLACK_BOT_TOKEN": "your-slack-token",
        "SLACK_TEAM_ID": "your-team-id"
      },
      "riskLevel": 1
    }
  }
}
```

### Risk Level Workflows

#### Low Risk (Level 1)
- Standard execution without additional steps
- Suitable for operations with minimal security concerns
- This is the default behavior when no risk level is specified

#### Medium Risk (Level 2)
1. Client makes a tool execution request
2. Server responds with a confirmation request containing a confirmation ID
3. Client must make a separate confirmation request to proceed
4. Only after confirmation does the server execute the operation

The MCP-Gemini Agent handles this confirmation flow automatically, prompting the user for approval when needed.

#### High Risk (Level 3)
- Server automatically runs in an isolated Docker container
- Provides environmental isolation for the MCP server process
- Requires Docker to be installed and properly configured

## 🚧 Deployment Considerations

### 🔒 Security

- Use HTTPS in production
- Add auth for sensitive operations
- Network-isolate critical services

### 📊 Scaling

- Use load balancers
- Pool high-demand servers
- Track metrics and resource pressure

## 📊 Comparison with Other MCP Bridge/Proxy Repositories

| Feature                  | [`ivanboring/mcp-rest`](https://github.com/ivanboring/mcp-rest) | [`INQUIRELAB/mcp-bridge-api`](https://github.com/INQUIRELAB/mcp-bridge-api) (This Repo) | [`SecretiveShell/MCP-Bridge`](https://github.com/SecretiveShell/MCP-Bridge) | [`JoshuaRileyDev/mcp-api`](https://github.com/JoshuaRileyDev/mcp-api) | [`rakesh-eltropy/mcp-client`](https://github.com/rakesh-eltropy/mcp-client) | [`bartolli/mcp-llm-bridge`](https://github.com/bartolli/mcp-llm-bridge) |
| :----------------------- | :--------------------------------------------------------------- | :---------------------------------------------------------------------------------- | :---------------------------------------------------------------------- | :----------------------------------------------------------------- | :------------------------------------------------------------------------ | :---------------------------------------------------------------------- |
| ⚙️ **Primary Language**  | Node.js                                                          | **Node.js (Bridge) + Python (Agent) ✨**                                              | Python                                                                  | Node.js                                                                | Python                                                                    | Python                                                                  |
| 🎯 **Main Purpose**      | Simple REST wrapper                                              | **LLM-Agnostic REST Bridge + Gemini Agent**                                    | Feature-rich OpenAI & REST Bridge + MCP Server                          | REST API for MCP Servers + Chat UI Example                             | LangChain Agent w/ MCP Tools (REST/CLI)                                 | MCP <-> LLM Bridge (OpenAI compatible)                                |
| 🔌 **MCP Connection**   | SSE only                                                         | **STDIO (Managed) + Docker (Risk-based) ✔️**                                        | STDIO, SSE, Docker                                                      | STDIO                                                                  | STDIO (LangChain)                                                       | STDIO                                                                   |
| 🚀 **API Interface**     | Basic REST                                                       | **Unified REST API ✔️**                                                             | OpenAI compatible, REST, MCP Server (SSE)                               | REST API + Swagger                                                     | REST API (Streaming), CLI                                                 | Interactive CLI                                                         |
| ✨ **Key Features**       | Basic tool list/call                                           | **Multi-server, Risk Levels, Security Confirm, Docker Exec, Gemini Agent, Config Flexibility ✨** | OpenAI compat., Sampling, Multi-transport, Auth, Docker/Helm, Flexible Config | Multi-server, Tool Name Norm., Swagger, Chat UI                        | LangChain Integration, REST/CLI, Streaming                              | Bidirectional Protocol Translation, DB Tool                             |
| 🔧 **Configuration**     | CLI args                                                         | **JSON file + Env Vars ✔️**                                                         | JSON file, HTTP URL, Env Vars                                           | JSON file (multi-path search), Env Vars                                | JSON file                                                                 | Python Object, Env Vars                                                 |
| 🧩 **LLM Integration**   | None                                                             | **Yes (Dedicated Gemini Agent w/ Multi-Step Reasoning) ✨**                           | Yes (OpenAI endpoint)                                                 | None (API only)                                                        | Yes (LangChain)                                                           | Yes (OpenAI client)                                                   |                                                          |
| 🏗️ **Complexity**       | Low                                                         | **Low ✔️**                                                          | High                                                                    | Moderate                                                               | Moderate-High                                                             | Moderate                                                                |
| 🛡️ **Security Features** | None                                                             | **Risk Levels (Medium/High) + Confirmation Flow + Docker Isolation ✨**               | Basic Auth (API Keys), CORS                                             | None                                                                   | None                                                                      | None                                                                    |
| 📦 **Key Dependencies**  | `express`, `mcp-client`                                        | `express`, `uuid` (Bridge, minimum dependency); `requests`, `google-genai`, `rich` (Agent)            | `fastapi`, `mcp`, `mcpx`                                                  | `express`, `@mcp/sdk`, `socket.io`                                     | `fastapi`, `mcp`, `langchain`, `langgraph`                              | `mcp`, `openai`, `pydantic`                                             |
| 🤝 **Architecture**      | Simple Facade                                                    | **Decoupled Bridge + Agent ✨**                                                     | Monolithic Bridge/Server                                                | REST API Server                                                        | LangChain Agent App                                                       | CLI Bridge Application                                                  |

**Icon Key:**

*   ✨ : Unique or particularly strong advantage of `INQUIRELAB/mcp-bridge-api`.
*   ✔️ : Feature present and well-implemented, often comparable or slightly advantageous compared to simpler implementations.

## 📝 License

MIT License

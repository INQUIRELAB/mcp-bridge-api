# MCP Bridge API

## A Lightweight, LLM-Agnostic RESTful Proxy for Model Context Protocol Servers

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## 📚 Introduction

MCP Bridge is a lightweight, fast, and LLM-agnostic proxy that connects to multiple Model Context Protocol (MCP) servers and exposes their capabilities through a unified REST API. It enables any client on any platform to leverage MCP functionality without process execution constraints. Unlike Anthropic's official MCP SDK, MCP Bridge is fully independent and designed to work with any LLM backend which makes it adaptable, modular, and future-proof for diverse deployments. MCP Bridge also features optional risk-based execution levels that provide granular security controls—from standard execution to confirmation workflows and Docker isolation—all while maintaining backward compatibility with standard MCP clients.

### ⚠️ The Problem

- Many MCP servers use STDIO transports requiring local process execution
- Edge devices, mobile devices, web browsers, and other platforms cannot efficiently run npm or Python MCP servers
- Direct MCP server connections are impractical in resource-constrained environments
- Multiple isolated clients connecting to the same servers causes redundancy and increases resource usage

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

- Node.js 18+ 

### 🚀 Quick Setup

```bash
# Install dependencies
npm install express cors morgan uuid

# Start the server
node mcp-bridge.js
```

## ⚙️ Configuration

MCP Bridge is configured through a JSON file named `mcp_config.json` in the project root. This is an example of a basic MCP config:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/directory"]
    },
    "slack": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-slack"],
      "env": {
        "SLACK_BOT_TOKEN": "your-slack-token",
        "SLACK_TEAM_ID": "your-team-id"
      }
    }
  }
}
```

For enhanced security and execution control, you can configure optional risk levels for each server. See the [Risk Levels](#-risk-levels) section for detailed information and configuration examples.

## 🧪 API Usage

MCP Bridge exposes a clean and intuitive REST API for interacting with connected servers. Here's a breakdown of available endpoints:

### 📋 General Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/servers` | GET | List all connected MCP servers |
| `/servers` | POST | Start a new MCP server |
| `/servers/{serverId}` | DELETE | Stop and remove an MCP server |
| `/health` | GET | Get health status of the MCP Bridge |
| `/tools/{toolName}` | POST | Execute a tool on the first available server |
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

### 🔐 Risk Levels

MCP Bridge implements an optional risk level system that provides control over server execution behaviors. Risk levels help manage security and resource concerns when executing potentially sensitive MCP server operations.

#### Risk Level Classification

| Level | Name | Description | Behavior |
|-------|------|-------------|----------|
| 1 | Low | Standard execution | Direct execution without confirmation |
| 2 | Medium | Requires confirmation | Client must confirm execution before processing |
| 3 | High | Docker execution required | Server runs in isolated Docker container |

#### Configuring Risk Levels

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
    },
  }
}
```

#### Risk Level Workflows

##### Low Risk (Level 1)
- Standard execution without additional steps
- Suitable for operations with minimal security concerns
- This is the default behavior when no risk level is specified

##### Medium Risk (Level 2)
1. Client makes a tool execution request
2. Server responds with a confirmation request containing a confirmation ID
3. Client must make a separate confirmation request to proceed
4. Only after confirmation does the server execute the operation

Example confirmation flow:

```http
# 1. Initial request
POST /servers/filesystem/tools/read-file
Content-Type: application/json

{
  "path": "/some/file.txt"
}

# 2. Server response requiring confirmation
{
  "requires_confirmation": true,
  "confirmation_id": "abc123-uuid-here",
  "risk_level": 2,
  "risk_description": "Medium risk - Requires confirmation",
  "server_id": "filesystem",
  "method": "tools/call", 
  "tool_name": "read-file",
  "expires_at": "2023-07-01T12:34:56.789Z"
}

# 3. Confirmation request
POST /confirmations/abc123-uuid-here
Content-Type: application/json

{
  "confirm": true
}

# 4. Server executes request and returns result
{
  "content": "Contents of the file...",
  "size": 123
}
```

##### High Risk (Level 3)
- Requires Docker configuration
- Automatically runs the server in an isolated Docker container
- Responses include Docker execution information
- Provides stronger isolation for potentially dangerous operations

#### Backward Compatibility

Risk levels are completely optional. If you don't specify a risk level:

- Servers operate in standard mode (equivalent to level 1)
- No confirmation workflow is triggered
- No Docker execution is required
- API responses don't include risk level information

### ✅ Our Solution vs. Other Approaches

While other projects like [rakesh-eltropy/mcp-client](https://github.com/rakesh-eltropy/mcp-client) have attempted to integrate MCP servers with REST APIs, our approach is fundamentally different:

- **LLM Independence** 🧠: MCP Bridge is completely decoupled from any specific LLM API or provider, future-proofing it against changes in LLM architectures  
- **Pure Bridge Architecture** 🧩: We focus exclusively on the protocol bridging layer, without tying to specific LLM integrations like LangChain  
- **Lightweight Design** ⚡: Built for minimal resource consumption and maximum performance  
- **Unified Connection Pool** 🌐: All clients share a single pool of server connections, dramatically reducing resource usage  
- **Transport Protocol Abstraction** 🔌: Handles multiple transport types (STDIO, SSE) transparently to client applications  

## 🧠 Use Cases

- **🧱 Edge Devices** – Connect lightweight hardware such as smart home hubs, IoT sensors, or embedded devices to MCP-compatible tools without running local inference. MCP Bridge allows these constrained devices to issue requests (e.g., natural language commands, sensor queries) and receive LLM-generated responses via REST — ideal for use cases like smart thermostats, voice-controlled appliances, or environmental monitoring.

- **📱 Mobile Applications** – Offload heavy server processing while retaining full MCP capability. Ideal for mobile apps that need to interact with LLMs or perform complex operations without bundling or executing large models locally.

- **🌐 Web Applications** – Access MCP servers without spawning them client-side. This enables LLM-augmented functionality (e.g., summarization, code explanation) in browser-based tools, dashboards, or CMS platforms.

## 🚧 Deployment Considerations

### 🔒 Security

- Use HTTPS in production
- Add auth for sensitive operations
- Network-isolate critical services

### 📊 Scaling

- Use load balancers
- Pool high-demand servers
- Track metrics and resource pressure

This ensures full compatibility with standard MCP clients that aren't aware of the risk level feature.

## 📄 License

This project is licensed under the MIT License.


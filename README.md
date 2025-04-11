# MCP Bridge API

## A Lightweight, LLM-Agnostic RESTful Proxy for Model Context Protocol Servers with Gemini Integration

**Authors:**  
Arash Ahmadi, Sarah S. Sharif, and Yaser M. Banad*  
School of Electrical, and Computer Engineering, University of Oklahoma, Oklahoma, United States  
*Corresponding author: bana@ou.edu

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## 📚 Introduction

MCP Bridge is a lightweight, fast, and LLM-agnostic proxy that connects to multiple Model Context Protocol (MCP) servers and exposes their capabilities through a unified REST API. It enables any client on any platform to leverage MCP functionality without process execution constraints. Unlike Anthropic's official MCP SDK, MCP Bridge is fully independent and designed to work with any LLM backend which makes it adaptable, modular, and future-proof for diverse deployments. MCP Bridge also features optional risk-based execution levels that provide granular security controls—from standard execution to confirmation workflows and Docker isolation—all while maintaining backward compatibility with standard MCP clients.

This project now includes the MCP-Gemini Agent, a Python client that integrates Google's Gemini API with MCP Bridge. The agent enables natural language interaction with MCP tools through an intelligent LLM-powered interface. It features multi-step reasoning for complex operations, handles security confirmation workflows, and provides configurable display options for better usability. The combination of MCP Bridge's robust server-side capabilities with the Gemini Agent's intelligent client interface creates a powerful ecosystem for developing LLM-powered applications.

### ⚠️ The Problem

- Many MCP servers use STDIO transports requiring local process execution
- Edge devices, mobile devices, web browsers, and other platforms cannot efficiently run npm or Python MCP servers
- Direct MCP server connections are impractical in resource-constrained environments
- Multiple isolated clients connecting to the same servers causes redundancy and increases resource usage
- Interacting directly with MCP tools requires technical knowledge of specific tool formats and requirements

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

The MCP-Gemini Agent is a Python-based client that connects to MCP Bridge and uses Google's Gemini LLM to process user requests and execute MCP tools commands. Key features:

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
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "your-github-token"
      },
      "riskLevel": 3,
      "docker": {
        "image": "node:18",
        "volumes": ["/tmp:/tmp"],
        "network": "host"
      }
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

## 📝 License

MIT License


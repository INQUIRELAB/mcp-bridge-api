#!/usr/bin/env node

/**
 * MCP Bridge - RESTful Proxy for Model Context Protocol Servers
 * A lightweight, LLM-agnostic proxy that connects to multiple MCP servers
 * and exposes their capabilities through a unified REST API.
 */

// Import dependencies
const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');

// Risk level constants
const RISK_LEVEL = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3
};

// Risk level descriptions
const RISK_LEVEL_DESCRIPTION = {
  [RISK_LEVEL.LOW]: "Low risk - Standard execution",
  [RISK_LEVEL.MEDIUM]: "Medium risk - Requires confirmation",
  [RISK_LEVEL.HIGH]: "High risk - Docker execution required"
};

console.log('Starting MCP Bridge...');

// Create Express application
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

console.log('Middleware configured');

// Server state
const serverProcesses = new Map(); // Map of server IDs to processes
const pendingConfirmations = new Map(); // Map of request IDs to pending confirmations

// Helper function to load server configuration from file or environment
function loadServerConfig() {
  console.log('Loading server configuration...');
  let config = {};
  
  // Try to load from config file
  const configPath = process.env.MCP_CONFIG_PATH || path.join(process.cwd(), 'mcp_config.json');
  console.log(`Checking for config file at: ${configPath}`);
  
  try {
    if (fs.existsSync(configPath)) {
      const configFile = fs.readFileSync(configPath, 'utf8');
      config = JSON.parse(configFile).mcpServers || {};
      console.log(`Loaded configuration from ${configPath}:`, Object.keys(config));
      
      // For backward compatibility, validate risk levels if present
      for (const [serverId, serverConfig] of Object.entries(config)) {
        if (serverConfig.riskLevel !== undefined) {
          if (![RISK_LEVEL.LOW, RISK_LEVEL.MEDIUM, RISK_LEVEL.HIGH].includes(serverConfig.riskLevel)) {
            console.warn(`Warning: Invalid risk level ${serverConfig.riskLevel} for server ${serverId}, ignoring risk level`);
            delete serverConfig.riskLevel;
          } else if (serverConfig.riskLevel === RISK_LEVEL.HIGH && (!serverConfig.docker || !serverConfig.docker.image)) {
            console.warn(`Warning: Server ${serverId} has HIGH risk level but no docker configuration, downgrading to MEDIUM risk level`);
            serverConfig.riskLevel = RISK_LEVEL.MEDIUM;
          }
        }
      }
    } else {
      console.log(`No configuration file found at ${configPath}, using defaults or environment variables`);
    }
  } catch (error) {
    console.error(`Error loading configuration file: ${error.message}`);
  }
  
  // Allow environment variables to override config
  // Format: MCP_SERVER_NAME_COMMAND, MCP_SERVER_NAME_ARGS (comma-separated)
  Object.keys(process.env).forEach(key => {
    if (key.startsWith('MCP_SERVER_') && key.endsWith('_COMMAND')) {
      const serverName = key.replace('MCP_SERVER_', '').replace('_COMMAND', '').toLowerCase();
      const command = process.env[key];
      const argsKey = `MCP_SERVER_${serverName.toUpperCase()}_ARGS`;
      const args = process.env[argsKey] ? process.env[argsKey].split(',') : [];
      
      // Create or update server config
      config[serverName] = {
        command,
        args
      };
      
      // Check for environment variables
      const envKey = `MCP_SERVER_${serverName.toUpperCase()}_ENV`;
      if (process.env[envKey]) {
        try {
          config[serverName].env = JSON.parse(process.env[envKey]);
        } catch (error) {
          console.error(`Error parsing environment variables for ${serverName}: ${error.message}`);
        }
      }
      
      // Check for risk level
      const riskLevelKey = `MCP_SERVER_${serverName.toUpperCase()}_RISK_LEVEL`;
      if (process.env[riskLevelKey]) {
        try {
          const riskLevel = parseInt(process.env[riskLevelKey], 10);
          if ([RISK_LEVEL.LOW, RISK_LEVEL.MEDIUM, RISK_LEVEL.HIGH].includes(riskLevel)) {
            config[serverName].riskLevel = riskLevel;
            
            // For high risk level, check for docker configuration
            if (riskLevel === RISK_LEVEL.HIGH) {
              const dockerConfigKey = `MCP_SERVER_${serverName.toUpperCase()}_DOCKER_CONFIG`;
              if (process.env[dockerConfigKey]) {
                try {
                  config[serverName].docker = JSON.parse(process.env[dockerConfigKey]);
                } catch (error) {
                  console.error(`Error parsing docker configuration for ${serverName}: ${error.message}`);
                  console.warn(`Server ${serverName} has HIGH risk level but invalid docker configuration, downgrading to MEDIUM risk level`);
                  config[serverName].riskLevel = RISK_LEVEL.MEDIUM;
                }
              } else {
                console.warn(`Server ${serverName} has HIGH risk level but no docker configuration, downgrading to MEDIUM risk level`);
                config[serverName].riskLevel = RISK_LEVEL.MEDIUM;
              }
            }
          } else {
            console.warn(`Invalid risk level ${riskLevel} for server ${serverName}, ignoring risk level`);
          }
        } catch (error) {
          console.error(`Error parsing risk level for ${serverName}: ${error.message}`);
        }
      }
      
      console.log(`Added server from environment: ${serverName}`);
    }
  });
  
  console.log(`Loaded ${Object.keys(config).length} server configurations`);
  return config;
}

// Initialize and connect to MCP servers
async function initServers() {
  console.log('Initializing MCP servers...');
  const serverConfig = loadServerConfig();
  
  console.log('Server configurations found:');
  console.log(JSON.stringify(serverConfig, null, 2));
  
  // Start each configured server
  for (const [serverId, config] of Object.entries(serverConfig)) {
    try {
      console.log(`Starting server: ${serverId}`);
      await startServer(serverId, config);
      console.log(`Server ${serverId} initialized successfully`);
    } catch (error) {
      console.error(`Failed to initialize server ${serverId}: ${error.message}`);
    }
  }
  
  console.log('All servers initialized');
}

// Start a specific MCP server
async function startServer(serverId, config) {
  console.log(`Starting MCP server process: ${serverId} with command: ${config.command} ${config.args.join(' ')}`);
  
  // Set default risk level to undefined for backward compatibility
  const riskLevel = config.riskLevel;
  
  if (riskLevel !== undefined) {
    console.log(`Server ${serverId} has risk level: ${riskLevel} (${RISK_LEVEL_DESCRIPTION[riskLevel]})`);
    
    // For high risk level, verify docker is configured
    if (riskLevel === RISK_LEVEL.HIGH) {
      if (!config.docker || typeof config.docker !== 'object') {
        throw new Error(`Server ${serverId} has HIGH risk level but no docker configuration`);
      }
      
      console.log(`Server ${serverId} will be started in docker container`);
    }
  } else {
    console.log(`Server ${serverId} has no risk level specified - using standard execution`);
  }
  
  return new Promise((resolve, reject) => {
    try {
      // Get the npm path
      let commandPath = config.command;
      
      // If high risk, use docker
      if (riskLevel !== undefined && riskLevel === RISK_LEVEL.HIGH) {
        commandPath = 'docker';
        const dockerArgs = ['run', '--rm'];
        
        // Add any environment variables
        if (config.env && typeof config.env === 'object') {
          Object.entries(config.env).forEach(([key, value]) => {
            dockerArgs.push('-e', `${key}=${value}`);
          });
        }
        
        // Add volume mounts if specified
        if (config.docker.volumes && Array.isArray(config.docker.volumes)) {
          config.docker.volumes.forEach(volume => {
            dockerArgs.push('-v', volume);
          });
        }
        
        // Add network configuration if specified
        if (config.docker.network) {
          dockerArgs.push('--network', config.docker.network);
        }
        
        // Add the image and command
        dockerArgs.push(config.docker.image);
        
        // If original command was a specific executable, use it as the command in the container
        if (config.command !== 'npm' && config.command !== 'npx') {
          dockerArgs.push(config.command);
        }
        
        // Add the original args
        dockerArgs.push(...config.args);
        
        // Update args to use docker
        config = {
          ...config,
          originalCommand: config.command,
          command: commandPath,
          args: dockerArgs,
          riskLevel // Keep the risk level
        };
        
        console.log(`Transformed command for docker: ${commandPath} ${dockerArgs.join(' ')}`);
      }
      // If the command is npx or npm, try to find their full paths
      else if (config.command === 'npx' || config.command === 'npm') {
        // On Windows, try to use the npm executable from standard locations
        if (process.platform === 'win32') {
          const possiblePaths = [
            // Global npm installation
            path.join(process.env.APPDATA || '', 'npm', `${config.command}.cmd`),
            // Node installation directory
            path.join(process.env.ProgramFiles || '', 'nodejs', `${config.command}.cmd`),
            // Common Node installation location
            path.join('C:\\Program Files\\nodejs', `${config.command}.cmd`),
          ];
          
          for (const possiblePath of possiblePaths) {
            if (fs.existsSync(possiblePath)) {
              console.log(`Found ${config.command} at ${possiblePath}`);
              commandPath = possiblePath;
              break;
            }
          }
        } else {
          // On Unix-like systems, try using which to find the command
          try {
            const { execSync } = require('child_process');
            const whichOutput = execSync(`which ${config.command}`).toString().trim();
            if (whichOutput) {
              console.log(`Found ${config.command} at ${whichOutput}`);
              commandPath = whichOutput;
            }
          } catch (error) {
            console.error(`Error finding full path for ${config.command}:`, error.message);
          }
        }
      }
      
      console.log(`Using command path: ${commandPath}`);
      
      // Special handling for Windows command prompt executables (.cmd files)
      const isWindowsCmd = process.platform === 'win32' && commandPath.endsWith('.cmd');
      const actualCommand = isWindowsCmd ? 'cmd' : commandPath;
      const actualArgs = isWindowsCmd ? ['/c', commandPath, ...config.args] : config.args;
      
      console.log(`Spawning process with command: ${actualCommand} and args:`, actualArgs);
      
      // Combine environment variables
      const envVars = { ...process.env };
      
      // Add custom environment variables if provided
      if (config.env && typeof config.env === 'object') {
        console.log(`Adding environment variables for ${serverId}:`, config.env);
        Object.assign(envVars, config.env);
      } else {
        console.log(`No custom environment variables for ${serverId}`);
      }
      
      // Spawn the server process with shell option for better compatibility
      const serverProcess = spawn(actualCommand, actualArgs, {
        env: envVars,
        stdio: 'pipe',
        shell: !isWindowsCmd // Use shell only if not handling Windows .cmd specially
      });
      
      console.log(`Server process spawned for ${serverId}, PID: ${serverProcess.pid}`);
      
      // Store the server process with its risk level
      serverProcesses.set(serverId, {
        process: serverProcess,
        riskLevel,
        pid: serverProcess.pid,
        config
      });
      
      // Set up communication
      const setupMCPCommunication = () => {
        // Send initialize request to the MCP server
        const initializeRequest = {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "0.3.0",
            clientInfo: {
              name: "mcp-bridge",
              version: "1.0.0"
            },
            capabilities: {
              // Add capabilities as needed
            }
          }
        };
        
        serverProcess.stdin.write(JSON.stringify(initializeRequest) + '\n');
        console.log(`Sent initialize request to ${serverId}`);
      };
      
      // Set up various event listeners
      serverProcess.stdout.on('data', (data) => {
        console.log(`[${serverId}] STDOUT: ${data.toString().trim()}`);
      });
      
      serverProcess.stderr.on('data', (data) => {
        console.log(`[${serverId}] STDERR: ${data.toString().trim()}`);
      });
      
      serverProcess.on('error', (error) => {
        console.error(`[${serverId}] Process error: ${error.message}`);
        reject(error);
      });
      
      serverProcess.on('close', (code) => {
        console.log(`[${serverId}] Process exited with code ${code}`);
        serverProcesses.delete(serverId);
      });
      
      // Wait a moment for the process to start
      setTimeout(() => {
        setupMCPCommunication();
        resolve(serverProcess);
      }, 1000);
    } catch (error) {
      console.error(`Error starting server ${serverId}:`, error);
      reject(error);
    }
  });
}

// Shutdown an MCP server
async function shutdownServer(serverId) {
  console.log(`Shutting down server: ${serverId}`);
  const serverInfo = serverProcesses.get(serverId);
  
  if (serverInfo) {
    try {
      console.log(`Killing process for ${serverId}`);
      serverInfo.process.kill();
    } catch (error) {
      console.error(`Error killing process for ${serverId}: ${error.message}`);
    }
    
    serverProcesses.delete(serverId);
  }
  
  console.log(`Server ${serverId} shutdown complete`);
}

// MCP request handler
async function sendMCPRequest(serverId, method, params = {}, confirmationId = null) {
  return new Promise((resolve, reject) => {
    const serverInfo = serverProcesses.get(serverId);
    
    if (!serverInfo) {
      return reject(new Error(`Server '${serverId}' not found or not connected`));
    }
    
    const { process: serverProcess, riskLevel, config } = serverInfo;
    
    // Only perform risk level checks if explicitly configured (for backward compatibility)
    if (riskLevel !== undefined && riskLevel === RISK_LEVEL.MEDIUM && method === 'tools/call' && !confirmationId) {
      // Generate a confirmation ID for this request
      const pendingId = uuidv4();
      console.log(`Medium risk level request for ${serverId}/${method} - requires confirmation (ID: ${pendingId})`);
      
      // Store the pending confirmation
      pendingConfirmations.set(pendingId, {
        serverId,
        method,
        params,
        timestamp: Date.now()
      });
      
      // Return a response that requires confirmation
      return resolve({
        requires_confirmation: true,
        confirmation_id: pendingId,
        risk_level: riskLevel,
        risk_description: RISK_LEVEL_DESCRIPTION[riskLevel],
        server_id: serverId,
        method,
        tool_name: params.name,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes
      });
    }
    
    const requestId = uuidv4();
    
    const request = {
      jsonrpc: "2.0",
      id: requestId,
      method,
      params
    };
    
    console.log(`Sending request to ${serverId}: ${method}`, params);
    
    // Set up one-time response handler
    const messageHandler = (data) => {
      try {
        const responseText = data.toString();
        const lines = responseText.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const response = JSON.parse(line);
            
            if (response.id === requestId) {
              console.log(`Received response from ${serverId} for request ${requestId}`);
              
              // Remove handler after response is received
              serverProcess.stdout.removeListener('data', messageHandler);
              
              if (response.error) {
                return reject(new Error(response.error.message || 'Unknown error'));
              }
              
              // For high risk level, add information about docker execution (only if risk level is explicitly set)
              if (riskLevel !== undefined && riskLevel === RISK_LEVEL.HIGH) {
                const result = response.result || {};
                return resolve({
                  ...result,
                  execution_environment: {
                    risk_level: riskLevel,
                    risk_description: RISK_LEVEL_DESCRIPTION[riskLevel],
                    docker: true,
                    docker_image: config.docker?.image || 'unknown'
                  }
                });
              }
              
              return resolve(response.result);
            }
          } catch (parseError) {
            console.error(`Error parsing JSON response from ${serverId}:`, parseError);
          }
        }
      } catch (error) {
        console.error(`Error processing response from ${serverId}:`, error);
      }
    };
    
    // Add temporary response handler
    serverProcess.stdout.on('data', messageHandler);
    
    // Set a timeout for the request
    const timeout = setTimeout(() => {
      serverProcess.stdout.removeListener('data', messageHandler);
      reject(new Error(`Request to ${serverId} timed out after 10 seconds`));
    }, 10000);
    
    // Send the request
    serverProcess.stdin.write(JSON.stringify(request) + '\n');
    
    // Handle error case
    serverProcess.on('error', (error) => {
      clearTimeout(timeout);
      serverProcess.stdout.removeListener('data', messageHandler);
      reject(error);
    });
  });
}

// API Routes
console.log('Setting up API routes');

// Get server status
app.get('/servers', (req, res) => {
  console.log('GET /servers');
  const servers = Array.from(serverProcesses.entries()).map(([id, info]) => {
    // Create base server info
    const serverInfo = {
      id,
      connected: true,
      pid: info.pid
    };
    
    // Only include risk level information if it was explicitly set
    if (info.riskLevel !== undefined) {
      serverInfo.risk_level = info.riskLevel;
      serverInfo.risk_description = RISK_LEVEL_DESCRIPTION[info.riskLevel];
      
      if (info.riskLevel === RISK_LEVEL.HIGH) {
        serverInfo.running_in_docker = true;
      }
    }
    
    return serverInfo;
  });
  
  console.log(`Returning ${servers.length} servers`);
  res.json({ servers });
});

// Start a new server (manual configuration)
app.post('/servers', async (req, res) => {
  console.log('POST /servers', req.body);
  try {
    const { id, command, args, env, riskLevel, docker } = req.body;
    
    if (!id || !command) {
      console.log('Missing required fields');
      return res.status(400).json({
        error: "Server ID and command are required"
      });
    }
    
    if (serverProcesses.has(id)) {
      console.log(`Server with ID '${id}' already exists`);
      return res.status(409).json({
        error: `Server with ID '${id}' already exists`
      });
    }
    
    // Validate risk level if provided
    if (riskLevel !== undefined) {
      if (![RISK_LEVEL.LOW, RISK_LEVEL.MEDIUM, RISK_LEVEL.HIGH].includes(riskLevel)) {
        return res.status(400).json({
          error: `Invalid risk level: ${riskLevel}. Valid values are: ${RISK_LEVEL.LOW} (low), ${RISK_LEVEL.MEDIUM} (medium), ${RISK_LEVEL.HIGH} (high)`
        });
      }
      
      // For high risk level, docker config is required
      if (riskLevel === RISK_LEVEL.HIGH && (!docker || !docker.image)) {
        return res.status(400).json({
          error: "Docker configuration with 'image' property is required for high risk level servers"
        });
      }
    }
    
    // Create the configuration object - only include riskLevel if explicitly set
    const config = { 
      command, 
      args: args || [], 
      env: env || {}
    };
    
    // Only add risk level if explicitly provided
    if (riskLevel !== undefined) {
      config.riskLevel = riskLevel;
      
      // Add docker config if provided for high risk levels
      if (riskLevel === RISK_LEVEL.HIGH && docker) {
        config.docker = docker;
      }
    }
    
    console.log(`Starting server '${id}' with config:`, config);
    await startServer(id, config);
    
    const serverInfo = serverProcesses.get(id);
    console.log(`Server '${id}' started successfully`);
    
    // Create response object
    const response = {
      id,
      status: "connected",
      pid: serverInfo.pid
    };
    
    // Only include risk level information if explicitly set
    if (serverInfo.riskLevel !== undefined) {
      response.risk_level = serverInfo.riskLevel;
      response.risk_description = RISK_LEVEL_DESCRIPTION[serverInfo.riskLevel];
      
      if (serverInfo.riskLevel === RISK_LEVEL.HIGH) {
        response.running_in_docker = true;
      }
    }
    
    res.status(201).json(response);
  } catch (error) {
    console.error(`Error starting server: ${error.message}`);
    res.status(500).json({
      error: error.message
    });
  }
});

// Stop a server
app.delete('/servers/:serverId', async (req, res) => {
  const { serverId } = req.params;
  console.log(`DELETE /servers/${serverId}`);
  
  if (!serverProcesses.has(serverId)) {
    console.log(`Server '${serverId}' not found`);
    return res.status(404).json({
      error: `Server '${serverId}' not found`
    });
  }
  
  try {
    console.log(`Shutting down server '${serverId}'`);
    await shutdownServer(serverId);
    console.log(`Server '${serverId}' shutdown complete`);
    res.json({
      status: "disconnected"
    });
  } catch (error) {
    console.error(`Error stopping server ${serverId}: ${error.message}`);
    res.status(500).json({
      error: error.message
    });
  }
});

// Get tools for a server
app.get('/servers/:serverId/tools', async (req, res) => {
  const { serverId } = req.params;
  console.log(`GET /servers/${serverId}/tools`);
  
  try {
    if (!serverProcesses.has(serverId)) {
      return res.status(404).json({
        error: `Server '${serverId}' not found or not connected`
      });
    }
    
    const result = await sendMCPRequest(serverId, 'tools/list');
    res.json(result);
  } catch (error) {
    console.error(`Error listing tools for ${serverId}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Execute a tool on a server
app.post('/servers/:serverId/tools/:toolName', async (req, res) => {
  const { serverId, toolName } = req.params;
  const arguments = req.body;
  
  console.log(`POST /servers/${serverId}/tools/${toolName}`, arguments);
  
  try {
    if (!serverProcesses.has(serverId)) {
      return res.status(404).json({
        error: `Server '${serverId}' not found or not connected`
      });
    }
    
    const serverInfo = serverProcesses.get(serverId);
    
    // Get risk level information for the response
    const riskLevel = serverInfo.riskLevel;
    
    const result = await sendMCPRequest(serverId, 'tools/call', {
      name: toolName,
      arguments
    });
    
    res.json(result);
  } catch (error) {
    console.error(`Error executing tool ${toolName}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Confirm a medium risk level request
app.post('/confirmations/:confirmationId', async (req, res) => {
  const { confirmationId } = req.params;
  const { confirm } = req.body;
  
  console.log(`POST /confirmations/${confirmationId}`, req.body);
  
  // Check if the confirmation exists
  if (!pendingConfirmations.has(confirmationId)) {
    return res.status(404).json({
      error: `Confirmation '${confirmationId}' not found or expired`
    });
  }
  
  const pendingRequest = pendingConfirmations.get(confirmationId);
  
  // Check if the confirmation is expired (10 minutes)
  const now = Date.now();
  if (now - pendingRequest.timestamp > 10 * 60 * 1000) {
    pendingConfirmations.delete(confirmationId);
    return res.status(410).json({
      error: `Confirmation '${confirmationId}' has expired`
    });
  }
  
  // If not confirmed, just delete the pending request
  if (!confirm) {
    pendingConfirmations.delete(confirmationId);
    return res.json({
      status: "rejected",
      message: "Request was rejected by the user"
    });
  }
  
  try {
    // Execute the confirmed request
    console.log(`Executing confirmed request for ${pendingRequest.serverId}`);
    const result = await sendMCPRequest(
      pendingRequest.serverId, 
      pendingRequest.method, 
      pendingRequest.params,
      confirmationId // Pass the confirmation ID to bypass confirmation check
    );
    
    // Delete the pending request
    pendingConfirmations.delete(confirmationId);
    
    // Return the result
    res.json(result);
  } catch (error) {
    console.error(`Error executing confirmed request: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Get resources for a server
app.get('/servers/:serverId/resources', async (req, res) => {
  const { serverId } = req.params;
  console.log(`GET /servers/${serverId}/resources`);
  
  try {
    if (!serverProcesses.has(serverId)) {
      return res.status(404).json({
        error: `Server '${serverId}' not found or not connected`
      });
    }
    
    const result = await sendMCPRequest(serverId, 'resources/list');
    res.json(result);
  } catch (error) {
    console.error(`Error listing resources for ${serverId}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Get a specific resource
app.get('/servers/:serverId/resources/:resourceUri', async (req, res) => {
  const { serverId, resourceUri } = req.params;
  console.log(`GET /servers/${serverId}/resources/${resourceUri}`);
  
  try {
    if (!serverProcesses.has(serverId)) {
      return res.status(404).json({
        error: `Server '${serverId}' not found or not connected`
      });
    }
    
    const decodedUri = decodeURIComponent(resourceUri);
    const result = await sendMCPRequest(serverId, 'resources/read', {
      uri: decodedUri
    });
    
    res.json(result);
  } catch (error) {
    console.error(`Error reading resource ${resourceUri}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Get prompts for a server
app.get('/servers/:serverId/prompts', async (req, res) => {
  const { serverId } = req.params;
  console.log(`GET /servers/${serverId}/prompts`);
  
  try {
    if (!serverProcesses.has(serverId)) {
      return res.status(404).json({
        error: `Server '${serverId}' not found or not connected`
      });
    }
    
    const result = await sendMCPRequest(serverId, 'prompts/list');
    res.json(result);
  } catch (error) {
    console.error(`Error listing prompts for ${serverId}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Execute a prompt
app.post('/servers/:serverId/prompts/:promptName', async (req, res) => {
  const { serverId, promptName } = req.params;
  const arguments = req.body;
  
  console.log(`POST /servers/${serverId}/prompts/${promptName}`, arguments);
  
  try {
    if (!serverProcesses.has(serverId)) {
      return res.status(404).json({
        error: `Server '${serverId}' not found or not connected`
      });
    }
    
    const result = await sendMCPRequest(serverId, 'prompts/get', {
      name: promptName,
      arguments
    });
    
    res.json(result);
  } catch (error) {
    console.error(`Error executing prompt ${promptName}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  console.log('GET /health');
  
  const servers = Array.from(serverProcesses.entries()).map(([id, info]) => {
    // Create base server info
    const serverInfo = {
      id,
      pid: info.pid
    };
    
    // Only include risk level information if explicitly set
    if (info.riskLevel !== undefined) {
      serverInfo.risk_level = info.riskLevel;
      serverInfo.risk_description = RISK_LEVEL_DESCRIPTION[info.riskLevel];
      
      if (info.riskLevel === RISK_LEVEL.HIGH) {
        serverInfo.running_in_docker = true;
      }
    }
    
    return serverInfo;
  });
  
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    serverCount: serverProcesses.size,
    servers
  });
});

// Start the server
app.listen(PORT, async () => {
  console.log(`MCP Bridge server running on port ${PORT}`);
  await initServers();
  console.log('Ready to handle requests');
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down servers...');
  
  const shutdownPromises = [];
  for (const serverId of serverProcesses.keys()) {
    shutdownPromises.push(shutdownServer(serverId));
  }
  
  await Promise.all(shutdownPromises);
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down servers...');
  
  const shutdownPromises = [];
  for (const serverId of serverProcesses.keys()) {
    shutdownPromises.push(shutdownServer(serverId));
  }
  
  await Promise.all(shutdownPromises);
  process.exit(0);
});
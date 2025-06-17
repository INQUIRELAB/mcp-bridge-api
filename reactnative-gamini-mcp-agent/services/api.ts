import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Create axios instance for MCP Bridge API
const mcpApi = axios.create();

// Interceptor to set the base URL from storage
mcpApi.interceptors.request.use(async (config) => {
  const baseUrl = await AsyncStorage.getItem('mcpBridgeUrl');
  if (baseUrl) {
    config.baseURL = baseUrl;
  }
  return config;
});

// MCP Bridge API methods
export const mcpBridgeAPI = {
  // Set base URL for MCP Bridge API
  setBaseUrl: async (url: string) => {
    await AsyncStorage.setItem('mcpBridgeUrl', url);
    return url;
  },

  // Get base URL for MCP Bridge API
  getBaseUrl: async () => {
    return await AsyncStorage.getItem('mcpBridgeUrl');
  },

  // Check health of MCP Bridge
  checkHealth: async () => {
    try {
      const response = await mcpApi.get('/health');
      return response.data;
    } catch (error) {
      console.error('Health check failed:', error);
      throw error;
    }
  },

  // Get all servers
  getServers: async () => {
    try {
      const response = await mcpApi.get('/servers');
      return response.data.servers;
    } catch (error) {
      console.error('Failed to get servers:', error);
      throw error;
    }
  },

  // Get all tools for a server
  getTools: async (serverId: string) => {
    try {
      const response = await mcpApi.get(`/servers/${serverId}/tools`);
      return response.data.tools;
    } catch (error) {
      console.error(`Failed to get tools for server ${serverId}:`, error);
      throw error;
    }
  },

  // Execute a tool
  executeTool: async (serverId: string, toolName: string, parameters: any) => {
    try {
      const response = await mcpApi.post(`/servers/${serverId}/tools/${toolName}`, parameters);
      return response.data;
    } catch (error) {
      console.error(`Failed to execute tool ${toolName}:`, error);
      throw error;
    }
  },

  // Confirm an operation (for medium risk level)
  confirmOperation: async (confirmationId: string, confirm: boolean) => {
    try {
      const response = await mcpApi.post(`/confirmations/${confirmationId}`, { confirm });
      return response.data;
    } catch (error) {
      console.error(`Failed to confirm operation ${confirmationId}:`, error);
      throw error;
    }
  }
}; 
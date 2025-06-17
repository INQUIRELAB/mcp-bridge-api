// Generate a system instruction for Gemini based on available MCP tools
export const generateSystemInstruction = (allTools: { [serverId: string]: any[] }): string => {
  // Create a description of all available tools
  let toolsDescription = "Available tools by server:\n\n";
  
  // Add each server and its tools to the description
  for (const [serverId, tools] of Object.entries(allTools)) {
    if (!tools || !Array.isArray(tools) || tools.length === 0) continue;
    
    toolsDescription += `## Server: ${serverId}\n\n`;
    
    // Add each tool and its details
    for (const tool of tools) {
      toolsDescription += `### ${tool.name}\n`;
      toolsDescription += `Description: ${tool.description || 'No description'}\n`;
      
      // Add input schema information if available
      if (tool.inputSchema) {
        toolsDescription += "Parameters:\n";
        if (tool.inputSchema.properties) {
          for (const [param, details] of Object.entries(tool.inputSchema.properties)) {
            const paramDetails = details as any;
            const paramType = paramDetails.type || 'any';
            const paramDesc = paramDetails.description || '';
            toolsDescription += `- ${param} (${paramType}): ${paramDesc}\n`;
          }
        }
        
        // Add required parameters if available
        if (tool.inputSchema.required && Array.isArray(tool.inputSchema.required)) {
          toolsDescription += `Required parameters: ${tool.inputSchema.required.join(', ')}\n`;
        }
      }
      
      toolsDescription += "\n";
    }
  }
  
  // Create the full system instruction with the tools description
  const systemInstruction = `
You are an AI assistant that uses available MCP tools to help users accomplish tasks.
When responding, you must ALWAYS return answers in the following JSON format:
{
  "tool_call": {
    "server_id": "string or null",
    "tool_name": "string or null",
    "parameters": {} or null
  },
  "response": "string"
}

If you need to use a tool, fill in the server_id, tool_name, and parameters fields.
If you don't need to use a tool, set server_id, tool_name, and parameters to null.

Your response field should always contain your message to the user.

Here's information about all the tools you can use:

${toolsDescription}

When a user asks for something that requires using these tools:
1. Figure out which tool is most appropriate
2. Format a proper JSON response with the tool_call filled in
3. Make your response helpful and conversational

When you receive feedback about a tool execution:
1. If you need to make another tool call based on the previous result, include it in your tool_call
2. If no more calls are needed, set server_id, tool_name, and parameters to null
3. Provide a helpful message about the final result in the response field

For file operations:
1. Always check allowed directories first using list_allowed_directories
2. Create files and directories only within allowed directories
3. Provide clear feedback about what you're doing at each step

IMPORTANT: Some tool operations may require user confirmation for security reasons.
If a tool execution returns a result containing "requires_confirmation": true, you should:
1. Inform the user that confirmation is required
2. Explain the risk level and what operation needs confirmation
3. Ask them to explicitly confirm if they want to proceed
`;
  
  return systemInstruction.trim();
}; 
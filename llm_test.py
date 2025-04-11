#!/usr/bin/env python3
"""
MCP-Gemini Agent - Integrating MCP with Gemini LLM

This script creates an agent that connects to MCP Bridge and uses Google's Gemini LLM
to process user requests and execute MCP tools commands. It supports multi-step reasoning
with the ability to make multiple API calls in sequence when needed.

This version supports:
1. Security confirmation flow for medium and high risk operations
2. Sequential tool calls for complex operations
3. Automatic discovery of allowed directories for file operations
4. Optional JSON result display control
5. Configurable MCP Bridge URL and port
"""

import os
import json
import requests
import argparse
from datetime import datetime
import google.generativeai as genai
from google.generativeai import GenerativeModel
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.prompt import Confirm
from rich.syntax import Syntax

# Default configuration
DEFAULT_MCP_BRIDGE_URL = "http://localhost:3000"  # Default URL for MCP Bridge
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "AIzaSyBd-syGa-yQdEuXaapII8ZikjYYoImtbts")
GEMINI_MODEL = "gemini-2.0-flash"  # Use the appropriate model as needed

console = Console()

def format_json_result(result, show_json=True, max_width=100):
    """Format JSON result for display, with optional hiding and width control."""
    if not show_json:
        return "<JSON result hidden>"
    
    if isinstance(result, dict):
        try:
            # Format with indentation and width control
            formatted = json.dumps(result, indent=2)
            
            # If the formatted result is too wide, try to compact it
            if any(len(line) > max_width for line in formatted.split('\n')):
                # Compact version with minimal formatting
                formatted = json.dumps(result, indent=1)
            
            # Create syntax-highlighted JSON
            return Syntax(formatted, "json", theme="monokai", word_wrap=True)
        except Exception:
            return str(result)
    return str(result)

def parse_arguments():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description="MCP-Gemini Agent with configurable settings")
    parser.add_argument(
        "--hide-json",
        action="store_true",
        help="Hide JSON results from tool executions"
    )
    parser.add_argument(
        "--json-width",
        type=int,
        default=100,
        help="Maximum width for JSON output (default: 100)"
    )
    parser.add_argument(
        "--mcp-url",
        type=str,
        default=DEFAULT_MCP_BRIDGE_URL,
        help=f"MCP Bridge URL including protocol and port (default: {DEFAULT_MCP_BRIDGE_URL})"
    )
    parser.add_argument(
        "--mcp-port",
        type=int,
        help="Override port in MCP Bridge URL (default: use port from --mcp-url)"
    )
    return parser.parse_args()

def get_mcp_url(args):
    """Construct the MCP Bridge URL from arguments."""
    mcp_url = args.mcp_url
    
    # If port is specified separately, update the URL
    if args.mcp_port:
        import urllib.parse
        parsed_url = urllib.parse.urlparse(mcp_url)
        # Reconstruct the URL with the new port
        mcp_url = urllib.parse.urlunparse((
            parsed_url.scheme,
            f"{parsed_url.netloc.split(':')[0]}:{args.mcp_port}",
            parsed_url.path,
            parsed_url.params,
            parsed_url.query,
            parsed_url.fragment
        ))
    
    return mcp_url

def setup_gemini():
    """Configure Gemini API with credentials."""
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY environment variable is not set")
    
    genai.configure(api_key=GEMINI_API_KEY)
    model = GenerativeModel(GEMINI_MODEL)
    console.print("[bold green]✓[/bold green] Gemini API configured successfully")
    return model

def get_all_servers(mcp_bridge_url):
    """Get list of all servers from MCP Bridge."""
    try:
        response = requests.get(f"{mcp_bridge_url}/servers")
        response.raise_for_status()
        return response.json().get("servers", [])
    except requests.RequestException as e:
        console.print(f"[bold red]Error getting servers:[/bold red] {e}")
        return []

def get_server_tools(server_id, mcp_bridge_url):
    """Get all tools for a specific server."""
    try:
        response = requests.get(f"{mcp_bridge_url}/servers/{server_id}/tools")
        response.raise_for_status()
        return response.json().get("tools", [])
    except requests.RequestException as e:
        console.print(f"[bold red]Error getting tools for server {server_id}:[/bold red] {e}")
        return []

def get_all_tools(mcp_bridge_url):
    """Get all tools from all servers."""
    servers = get_all_servers(mcp_bridge_url)
    all_tools = {}
    
    for server in servers:
        server_id = server["id"]
        tools = get_server_tools(server_id, mcp_bridge_url)
        all_tools[server_id] = tools
    
    return all_tools

def create_tools_description(all_tools):
    """Create a description of all available tools for the system instruction."""
    tools_description = "Available tools by server:\n\n"
    
    for server_id, tools in all_tools.items():
        tools_description += f"## Server: {server_id}\n\n"
        
        for tool in tools:
            tools_description += f"### {tool['name']}\n"
            tools_description += f"Description: {tool.get('description', 'No description')}\n"
            
            # Add input schema information if available
            if "inputSchema" in tool:
                tools_description += "Parameters:\n"
                if "properties" in tool["inputSchema"]:
                    for param, details in tool["inputSchema"]["properties"].items():
                        param_type = details.get("type", "any")
                        param_desc = details.get("description", "")
                        tools_description += f"- {param} ({param_type}): {param_desc}\n"
                
                # Add required parameters if available
                if "required" in tool["inputSchema"]:
                    tools_description += f"Required parameters: {', '.join(tool['inputSchema']['required'])}\n"
            
            tools_description += "\n"
    
    return tools_description

def create_system_instruction(all_tools):
    """Create a system instruction for Gemini that includes all available tools."""
    tools_description = create_tools_description(all_tools)
    
    system_instruction = f"""
You are an AI assistant that uses available MCP tools to help users accomplish tasks.
When responding, you must ALWAYS return answers in the following JSON format:
{{
  "tool_call": {{
    "server_id": "string or null",
    "tool_name": "string or null",
    "parameters": {{}} or null
  }},
  "response": "string"
}}

If you need to use a tool, fill in the server_id, tool_name, and parameters fields.
If you don't need to use a tool, set server_id, tool_name, and parameters to null.

Your response field should always contain your message to the user.

Here's information about all the tools you can use:

{tools_description}

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
"""
    
    return system_instruction.strip()

def execute_tool(server_id, tool_name, parameters, mcp_bridge_url):
    """Execute a tool on an MCP server."""
    try:
        url = f"{mcp_bridge_url}/servers/{server_id}/tools/{tool_name}"
        response = requests.post(url, json=parameters)
        response.raise_for_status()
        return response.json(), None
    except requests.RequestException as e:
        error_message = f"Error executing tool: {e}"
        if response := getattr(e, 'response', None):
            try:
                error_detail = response.json()
                error_message = f"Error: {error_detail.get('error', str(e))}"
            except:
                pass
        return None, error_message

def confirm_operation(confirmation_data, mcp_bridge_url):
    """Process a confirmation request for medium/high risk operations."""
    console.print(Panel(
        f"[bold yellow]⚠️ Security Confirmation Required[/bold yellow]\n\n"
        f"Operation: [bold]{confirmation_data['method']}[/bold] on server [bold]{confirmation_data['server_id']}[/bold]\n"
        f"Tool: [bold]{confirmation_data['tool_name']}[/bold]\n"
        f"Risk Level: [bold]{confirmation_data['risk_level']}[/bold] ({confirmation_data['risk_description']})\n"
        f"Expires: {confirmation_data['expires_at']}\n\n"
        "This operation requires explicit confirmation for security reasons.",
        title="Security Confirmation",
        border_style="yellow"
    ))
    
    # Ask for user confirmation
    confirmed = Confirm.ask("Do you want to proceed with this operation?", default=False)
    
    if confirmed:
        try:
            url = f"{mcp_bridge_url}/confirmations/{confirmation_data['confirmation_id']}"
            response = requests.post(url, json={"confirm": True})
            response.raise_for_status()
            return response.json(), None
        except requests.RequestException as e:
            error_message = f"Error confirming operation: {e}"
            if response := getattr(e, 'response', None):
                try:
                    error_detail = response.json()
                    error_message = f"Error: {error_detail.get('error', str(e))}"
                except:
                    pass
            return None, error_message
    else:
        try:
            url = f"{mcp_bridge_url}/confirmations/{confirmation_data['confirmation_id']}"
            response = requests.post(url, json={"confirm": False})
            response.raise_for_status()
            return {"status": "rejected", "message": "User rejected the operation"}, None
        except requests.RequestException as e:
            return {"status": "rejected", "message": "User rejected the operation"}, None

def process_llm_response(text):
    """Process the LLM response to extract the JSON part."""
    # Try to find JSON in the response
    try:
        # Look for JSON content - sometimes the model might wrap it with ```json
        if "```json" in text:
            json_text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            json_text = text.split("```")[1].strip()
        else:
            # Otherwise, just try to parse the text directly
            json_text = text.strip()
            
        response_data = json.loads(json_text)
        
        # Ensure the response has the expected structure
        if not isinstance(response_data, dict):
            response_data = {
                "tool_call": None,
                "response": str(response_data)
            }
        elif "tool_call" not in response_data:
            response_data["tool_call"] = None
        elif "response" not in response_data:
            response_data["response"] = ""
            
        return response_data
    except (json.JSONDecodeError, IndexError) as e:
        console.print(f"[bold red]Error parsing LLM response as JSON:[/bold red] {e}")
        console.print(f"Original response: {text}")
        # Return a default structure
        return {
            "tool_call": None,
            "response": "I couldn't format my response properly. Please try again with a clearer request."
        }

def main():
    """Main function to run the MCP-Gemini Agent."""
    # Parse command line arguments
    args = parse_arguments()
    show_json = not args.hide_json
    json_width = args.json_width
    mcp_bridge_url = get_mcp_url(args)
    
    console.print("[bold]MCP-Gemini Agent with Multi-Step Reasoning[/bold]")
    if not show_json:
        console.print("[yellow]JSON result display is disabled[/yellow]")
    console.print(f"Connecting to MCP Bridge at {mcp_bridge_url}...\n")
    
    # Check MCP Bridge connection
    try:
        health_response = requests.get(f"{mcp_bridge_url}/health")
        health_response.raise_for_status()
        console.print(f"[bold green]✓[/bold green] Connected to MCP Bridge: {health_response.json()['serverCount']} servers found")
    except requests.RequestException as e:
        console.print(f"[bold red]Error connecting to MCP Bridge at {mcp_bridge_url}:[/bold red] {e}")
        console.print("Please make sure MCP Bridge is running. Exiting...")
        return
    
    # Setup Gemini
    try:
        model = setup_gemini()
    except Exception as e:
        console.print(f"[bold red]Error setting up Gemini:[/bold red] {e}")
        return
    
    # Get all tools from all servers
    all_tools = get_all_tools(mcp_bridge_url)
    if not all_tools:
        console.print("[bold yellow]Warning:[/bold yellow] No tools found from any server.")
    else:
        console.print(f"[bold green]✓[/bold green] Found tools from {len(all_tools)} servers")
    
    # Create system instruction with tools information
    system_instruction = create_system_instruction(all_tools)
    
    # Create chat session
    console.print("\n[bold]Starting chat session. Type 'exit' to quit.[/bold]\n")
    
    # Initialize chat
    chat = model.start_chat(history=[])
    chat.send_message(system_instruction)  # Send system instruction as first message
    
    # Main chat loop
    while True:
        # Get user input
        user_input = input("You: ")
        if user_input.lower() in ["exit", "quit"]:
            break
        
        # Send message to Gemini
        response = chat.send_message(user_input)
        
        # Process the response
        processed_response = process_llm_response(response.text)
        
        # Display the text response part
        console.print("\nAI:", style="bold")
        console.print(Markdown(processed_response["response"]))
        
        # Extract tool call information
        tool_call = processed_response.get("tool_call") or {}
        
        # Continue as long as there's a tool call to make
        while tool_call and all(tool_call.get(k) is not None for k in ["server_id", "tool_name", "parameters"]):
            server_id = tool_call.get("server_id")
            tool_name = tool_call.get("tool_name")
            parameters = tool_call.get("parameters")
            
            # Show the tool call parameters
            if show_json:
                console.print(f"\n[bold yellow]Executing tool:[/bold yellow] {server_id}/{tool_name}")
                console.print("Parameters:", style="bold")
                console.print(format_json_result(parameters, show_json=True, max_width=json_width))
            else:
                console.print(f"\n[bold yellow]Executing tool:[/bold yellow] {server_id}/{tool_name} (parameters hidden)")
            
            # Execute the tool
            result, error = execute_tool(server_id, tool_name, parameters, mcp_bridge_url)
            
            # Check if the operation requires confirmation
            if error is None and isinstance(result, dict) and result.get("requires_confirmation") is True:
                console.print("[bold yellow]Operation requires security confirmation[/bold yellow]")
                # Handle the confirmation
                result, error = confirm_operation(result, mcp_bridge_url)
            
            # Handle errors
            if error:
                console.print(f"[bold red]Tool execution failed:[/bold red] {error}")
                tool_feedback = f"The tool execution failed with error: {error}"
            else:
                console.print(f"[bold green]Tool execution successful[/bold green]")
                
                # Format and display the result
                if isinstance(result, dict):
                    result_str = json.dumps(result, indent=2)
                else:
                    result_str = str(result)
                
                # Display the result based on show_json setting
                console.print("Result:", style="bold")
                console.print(format_json_result(result, show_json, json_width))
                
                # Check if the operation was rejected by the user
                if isinstance(result, dict) and result.get("status") == "rejected":
                    tool_feedback = f"The operation was cancelled by the user: {result.get('message', 'No reason provided')}"
                else:
                    tool_feedback = f"The tool {tool_name} was executed successfully. Result: {result_str}"
            
            # Send feedback to Gemini
            response = chat.send_message(tool_feedback)
            processed_response = process_llm_response(response.text)
            
            # Display the feedback response
            console.print("\nAI:", style="bold")
            console.print(Markdown(processed_response["response"]))
            
            # Get the next tool call if any
            tool_call = processed_response.get("tool_call") or {}
        
        console.print("\n" + "-" * 50 + "\n")

if __name__ == "__main__":
    main()
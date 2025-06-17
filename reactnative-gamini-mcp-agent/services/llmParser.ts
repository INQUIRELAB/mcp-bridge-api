// Parses the LLM response to extract structured data for MCP Bridge communication
export const parseLLMResponse = (text: string): {
  tool_call: {
    server_id: string | null;
    tool_name: string | null;
    parameters: any | null;
  } | null;
  response: string;
} => {
  try {
    // First, try to extract JSON from the response using multiple strategies
    let jsonText = '';
    let remainingText = text;
    
    // Strategy 1: Look for JSON wrapped in ```json blocks
    const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch) {
      jsonText = jsonBlockMatch[1].trim();
      // Remove the JSON block from the text to get the remaining content
      remainingText = text.replace(/```json\s*[\s\S]*?\s*```/, '').trim();
    }
    // Strategy 2: Look for JSON wrapped in ``` blocks (without json specifier)
    else {
      const codeBlockMatch = text.match(/```\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        const potentialJson = codeBlockMatch[1].trim();
        // Check if it looks like JSON (starts with { and ends with })
        if (potentialJson.startsWith('{') && potentialJson.endsWith('}')) {
          jsonText = potentialJson;
          remainingText = text.replace(/```\s*[\s\S]*?\s*```/, '').trim();
        }
      }
    }
    
    // Strategy 3: Look for JSON-like content in the text (starts with { and ends with })
    if (!jsonText) {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonText = jsonMatch[0].trim();
        // Remove the JSON from the text to get the remaining content
        remainingText = text.replace(/\{[\s\S]*\}/, '').trim();
      }
    }
    
    // Strategy 4: If no JSON found, treat the entire text as a response
    if (!jsonText) {
      return {
        tool_call: null,
        response: text.trim()
      };
    }
    
    // Try to parse the extracted JSON
    let parsedData;
    try {
      parsedData = JSON.parse(jsonText);
    } catch (jsonError) {
      // If JSON parsing fails, try to fix common issues
      console.warn('Initial JSON parsing failed, attempting to fix common issues:', jsonError);
      
      // Try to fix trailing commas and other common JSON issues
      let fixedJson = jsonText
        .replace(/,\s*}/g, '}')  // Remove trailing commas before }
        .replace(/,\s*]/g, ']')  // Remove trailing commas before ]
        .replace(/'/g, '"')      // Replace single quotes with double quotes
        .replace(/(\w+):/g, '"$1":'); // Add quotes around unquoted keys
      
      try {
        parsedData = JSON.parse(fixedJson);
      } catch (fixError) {
        // If we still can't parse it, return the original text as response
        console.warn('Could not fix JSON, treating as plain text response');
        return {
          tool_call: null,
          response: text.trim()
        };
      }
    }
    
    // Ensure the response has the expected structure
    if (typeof parsedData !== 'object' || parsedData === null) {
      return {
        tool_call: null,
        response: remainingText || String(parsedData) || text.trim()
      };
    }
    
    // Extract tool call information
    let toolCall = null;
    if (parsedData.tool_call && typeof parsedData.tool_call === 'object') {
      toolCall = {
        server_id: parsedData.tool_call.server_id || null,
        tool_name: parsedData.tool_call.tool_name || null,
        parameters: parsedData.tool_call.parameters || null
      };
    }
    
    // Combine the structured response with any remaining text
    let responseText = '';
    if (parsedData.response) {
      responseText = parsedData.response;
    }
    if (remainingText && remainingText !== responseText) {
      responseText = remainingText + (responseText ? '\n\n' + responseText : '');
    }
    if (!responseText) {
      responseText = text.trim();
    }
    
    return {
      tool_call: toolCall,
      response: responseText
    };
    
  } catch (error) {
    console.error('Error parsing LLM response:', error);
    console.log('Original response text:', text);
    
    // Return the original text as response instead of an error message
    return {
      tool_call: null,
      response: text.trim()
    };
  }
}; 
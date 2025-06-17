import { GoogleGenerativeAI } from '@google/generative-ai';
import AsyncStorage from '@react-native-async-storage/async-storage';

let generativeAI: GoogleGenerativeAI | null = null;
let geminiModel: any = null;
let chatSession: any = null;

// Gemini API service
export const geminiAPI = {
  // Initialize Gemini API with API key
  initialize: async (apiKey?: string) => {
    try {
      // If API key is provided, save it
      if (apiKey) {
        await AsyncStorage.setItem('geminiApiKey', apiKey);
      } else {
        // Otherwise, try to get it from storage
        const storedApiKey = await AsyncStorage.getItem('geminiApiKey');
        if (!storedApiKey) {
          throw new Error('Gemini API key not found');
        }
        apiKey = storedApiKey;
      }

      // Initialize the Gemini API
      generativeAI = new GoogleGenerativeAI(apiKey);
      
      // Get the model (default to gemini-1.5-flash)
      const modelName = await AsyncStorage.getItem('geminiModelName') || 'gemini-1.5-flash';
      geminiModel = generativeAI.getGenerativeModel({ model: modelName });
      
      // Initialize a chat session if needed
      if (!chatSession) {
        chatSession = geminiModel.startChat();
      }
      
      return true;
    } catch (error) {
      console.error('Failed to initialize Gemini API:', error);
      throw error;
    }
  },

  // Set the Gemini model to use
  setModel: async (modelName: string) => {
    try {
      if (!generativeAI) {
        throw new Error('Gemini API not initialized');
      }
      
      await AsyncStorage.setItem('geminiModelName', modelName);
      geminiModel = generativeAI.getGenerativeModel({ model: modelName });
      chatSession = geminiModel.startChat();
      
      return true;
    } catch (error) {
      console.error('Failed to set Gemini model:', error);
      throw error;
    }
  },

  // Get the current API key
  getApiKey: async () => {
    return await AsyncStorage.getItem('geminiApiKey');
  },

  // Get the current model name
  getModelName: async () => {
    return await AsyncStorage.getItem('geminiModelName') || 'gemini-1.5-flash';
  },

  // Send a message to Gemini
  sendMessage: async (message: string, expectResponse: boolean = true) => {
    try {
      if (!chatSession) {
        throw new Error('Chat session not initialized');
      }
      
      const result = await chatSession.sendMessage(message);
      
      // Only return the text if we expect a response
      if (expectResponse) {
        return result.response.text();
      }
      
      // Otherwise just return success status
      return 'Message sent successfully';
    } catch (error) {
      console.error('Failed to send message to Gemini:', error);
      throw error;
    }
  },

  // Send system instruction to Gemini (used to set up the tools and context)
  sendSystemInstruction: async (instruction: string) => {
    try {
      if (!chatSession) {
        throw new Error('Chat session not initialized');
      }
      
      const result = await chatSession.sendMessage(instruction);
      return result.response.text();
    } catch (error) {
      console.error('Failed to send system instruction to Gemini:', error);
      throw error;
    }
  },

  // Reset the chat session
  resetChat: async () => {
    try {
      if (!geminiModel) {
        throw new Error('Gemini model not initialized');
      }
      
      chatSession = geminiModel.startChat();
      return true;
    } catch (error) {
      console.error('Failed to reset chat session:', error);
      throw error;
    }
  },

  // Generate a concise title from a user message
  generateChatTitle: async (userMessage: string): Promise<string> => {
    try {
      if (!geminiModel) {
        throw new Error('Gemini model not initialized');
      }
      
      // Create a one-off model call (not using the chat session)
      const titlePrompt = `
        Generate a very short, concise title (4-5 words maximum) that captures the essence of this user query.
        Be extremely brief and to-the-point. Focus on the core task or question.
        No punctuation at the end.
        
        User query: "${userMessage}"
        
        Title:
      `;
      
      // Use the non-chat model to avoid affecting the chat history
      const result = await geminiModel.generateContent(titlePrompt);
      const title = result.response.text().trim();
      
      // Ensure the title is short (max 30 chars)
      return title.length > 30 ? title.substring(0, 27) + '...' : title;
    } catch (error) {
      console.error('Failed to generate chat title:', error);
      // Fallback to a substring of the message
      return userMessage.substring(0, 25) + (userMessage.length > 25 ? '...' : '');
    }
  }
}; 
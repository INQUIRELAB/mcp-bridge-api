import AsyncStorage from '@react-native-async-storage/async-storage';
import { geminiAPI } from './gemini';
// Replace UUID with a simple implementation that works in React Native
const generateId = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Define types for the conversation storage
export type MessageData = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date | string;
  toolCall?: {
    serverId: string;
    toolName: string;
    parameters: any;
  } | null;
  toolResult?: any;
};

export type Conversation = {
  id: string;
  title: string;
  messages: MessageData[];
  createdAt: string;
  updatedAt: string;
};

// Storage keys
const CONVERSATIONS_KEY = 'gemini_mcp_conversations';
const CURRENT_CONVERSATION_KEY = 'gemini_mcp_current_conversation';

/**
 * Service for managing conversations in AsyncStorage
 */
class ConversationStorageService {
  /**
   * Create a new conversation
   */
  async createConversation(title: string = 'New Conversation'): Promise<Conversation> {
    const id = generateId();
    const now = new Date().toISOString();
    
    const conversation: Conversation = {
      id,
      title,
      messages: [],
      createdAt: now,
      updatedAt: now
    };
    
    // Get existing conversations
    const conversations = await this.getAllConversations();
    
    // Add new conversation
    conversations.push(conversation);
    
    // Store updated conversations list
    await AsyncStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
    
    // Set as current conversation
    await this.setCurrentConversation(id);
    
    return conversation;
  }
  
  /**
   * Get a specific conversation by ID
   */
  async getConversation(id: string): Promise<Conversation | null> {
    const conversations = await this.getAllConversations();
    return conversations.find(c => c.id === id) || null;
  }
  
  /**
   * Get all conversations
   */
  async getAllConversations(): Promise<Conversation[]> {
    const data = await AsyncStorage.getItem(CONVERSATIONS_KEY);
    if (!data) return [];
    
    try {
      const conversations = JSON.parse(data) as Conversation[];
      return conversations.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } catch (error) {
      console.error('Error parsing conversations', error);
      return [];
    }
  }
  
  /**
   * Save messages to a conversation
   */
  async saveMessages(conversationId: string, messages: MessageData[], updateTimestamp: boolean = false): Promise<void> {
    // Format messages to ensure dates are strings
    const formattedMessages = messages.map(msg => ({
      ...msg,
      timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : msg.timestamp
    }));
    
    const conversations = await this.getAllConversations();
    const index = conversations.findIndex(c => c.id === conversationId);
    
    if (index !== -1) {
      conversations[index].messages = formattedMessages;
      
      // Only update the timestamp if explicitly requested
      if (updateTimestamp) {
        conversations[index].updatedAt = new Date().toISOString();
      }
      
      // Generate AI title from first user message if needed
      if (conversations[index].title === 'New Conversation' && formattedMessages.length > 0) {
        try {
          const firstUserMessage = formattedMessages.find(m => m.role === 'user');
          
          if (firstUserMessage) {
            // Use AI to generate a concise title
            const aiGeneratedTitle = await geminiAPI.generateChatTitle(firstUserMessage.content);
            conversations[index].title = aiGeneratedTitle;
          }
        } catch (error) {
          console.error('Error generating AI title:', error);
          
          // Fallback to simple title extraction
          const firstUserMessage = formattedMessages.find(m => m.role === 'user');
          if (firstUserMessage) {
            // Use first few characters of first user message as title
            const title = firstUserMessage.content.slice(0, 25) + (firstUserMessage.content.length > 25 ? '...' : '');
            conversations[index].title = title;
          }
        }
      }
      
      await AsyncStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
    }
  }
  
  /**
   * Delete a conversation
   */
  async deleteConversation(id: string): Promise<void> {
    const conversations = await this.getAllConversations();
    const filtered = conversations.filter(c => c.id !== id);
    await AsyncStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(filtered));
    
    // If we deleted the current conversation, clear it
    const currentId = await this.getCurrentConversationId();
    if (currentId === id) {
      await AsyncStorage.removeItem(CURRENT_CONVERSATION_KEY);
    }
  }
  
  /**
   * Set the current conversation
   */
  async setCurrentConversation(id: string, updateTimestamp: boolean = true): Promise<void> {
    await AsyncStorage.setItem(CURRENT_CONVERSATION_KEY, id);
    
    // Optionally update the timestamp to bring the conversation to the top
    if (updateTimestamp) {
      await this.updateConversationTimestamp(id);
    }
  }
  
  /**
   * Get the current conversation ID
   */
  async getCurrentConversationId(): Promise<string | null> {
    return AsyncStorage.getItem(CURRENT_CONVERSATION_KEY);
  }
  
  /**
   * Get the current conversation
   */
  async getCurrentConversation(): Promise<Conversation | null> {
    const id = await this.getCurrentConversationId();
    if (!id) return null;
    
    return this.getConversation(id);
  }
  
  /**
   * Update conversation title
   */
  async updateConversationTitle(id: string, title: string): Promise<void> {
    const conversations = await this.getAllConversations();
    const index = conversations.findIndex(c => c.id === id);
    
    if (index !== -1) {
      conversations[index].title = title;
      conversations[index].updatedAt = new Date().toISOString();
      await AsyncStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
    }
  }

  /**
   * Update conversation timestamp
   * This will move the conversation to the top of the list when sorted by updatedAt
   */
  async updateConversationTimestamp(id: string): Promise<void> {
    const conversations = await this.getAllConversations();
    const index = conversations.findIndex(c => c.id === id);
    
    if (index !== -1) {
      conversations[index].updatedAt = new Date().toISOString();
      await AsyncStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
    }
  }
}

export const conversationStorage = new ConversationStorageService(); 
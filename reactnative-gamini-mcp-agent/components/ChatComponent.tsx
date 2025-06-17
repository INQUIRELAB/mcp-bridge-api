import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, TouchableOpacity, Animated, Alert, Linking } from 'react-native';
import { TextInput, Button, Text, Card, Title, Paragraph, Dialog, Portal, Checkbox, useTheme, FAB, IconButton, Divider, Modal } from 'react-native-paper';
import Markdown from 'react-native-markdown-display';
import { mcpBridgeAPI } from '../services/api';
import { geminiAPI } from '../services/gemini';
import { parseLLMResponse } from '../services/llmParser';
import { generateSystemInstruction } from '../services/systemInstruction';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { conversationStorage, Conversation, MessageData } from '../services/conversationStorage';
import ConversationHistory from './ConversationHistory';
import { useRouter } from 'expo-router';
import { Link } from 'expo-router';

type MessageSegment = {
  id: string;
  type: 'text' | 'tool';
  content?: string; // For text segments
  toolOperation?: {
    id: string;
    toolCall: {
      serverId: string;
      toolName: string;
      parameters: any;
    };
    toolResult: any;
  }; // For tool segments
};

type Message = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string; // Legacy field - for backward compatibility
  segments?: MessageSegment[]; // New field for segmented content
  timestamp: Date;
  toolCall?: {
    serverId: string;
    toolName: string;
    parameters: any;
  } | null;
  toolResult?: any;
  requiresConfirmation?: boolean;
  confirmationInfo?: any;
  confirmationStatus?: 'pending' | 'confirmed' | 'rejected';
  aiResponse?: string;
  confirmationError?: string;
  isToolOperation?: boolean; // Flag to mark a message as a tool operation
  toolOperations?: Array<{
    id: string;
    toolCall: {
      serverId: string;
      toolName: string;
      parameters: any;
    };
    toolResult: any;
  }>;
  // Animation properties for individual messages
  fadeAnim?: Animated.Value;
  isNew?: boolean;
};

export default function ChatComponent() {
  const theme = useTheme();
  const router = useRouter();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [allTools, setAllTools] = useState<{[serverId: string]: any[]}>({});
  const [collapsedResults, setCollapsedResults] = useState<{[key: string]: boolean | undefined}>({});
  const [showHistory, setShowHistory] = useState(false);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    // Check initialization but don't load the conversations here
    checkInitialization();
  }, []);

  // Separate useEffect to load conversations once initialization is complete
  useEffect(() => {
    if (isInitialized) {
      loadCurrentConversation();
    }
  }, [isInitialized]);

  useEffect(() => {
    // Scroll to bottom when messages change
    if (scrollViewRef.current) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
    
    // Save messages to current conversation only if there are messages and we're not loading a different conversation
    if (currentConversation && !loading) {
      // Don't update the timestamp when automatically saving messages
      saveCurrentMessages(false);
    }
  }, [messages, currentConversation, loading]);

  const loadCurrentConversation = async () => {
    try {
      // Try to get the current conversation
      const conversation = await conversationStorage.getCurrentConversation();
      
      if (conversation) {
        // Set the conversation data in state
        setCurrentConversation(conversation);
        
        // Convert stored messages to the Message format (no animation for loaded messages)
        const loadedMessages: Message[] = conversation.messages.map(msg => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
          fadeAnim: new Animated.Value(1), // Already visible
          isNew: false
        }));
        
        if (loadedMessages.length > 0) {
          // Set UI messages
          setMessages(loadedMessages);
          
          // If we have tools initialized, rebuild the Gemini context for this conversation
          if (isInitialized && Object.keys(allTools).length > 0) {
            try {
              // First clear any existing conversation context
              await geminiAPI.resetChat();
              
              // Then initialize with system instructions
              const systemInstruction = generateSystemInstruction(allTools);
              await geminiAPI.sendSystemInstruction(systemInstruction);
              
              // Now replay user messages to rebuild conversation history
              // but don't expect responses from them (to avoid UI updates)
              const userMessages = loadedMessages
                .filter(msg => msg.role === 'user')
                .map(msg => msg.content);
                
              for (const message of userMessages) {
                await geminiAPI.sendMessage(message, false);
              }
              
              console.log('Successfully rebuilt conversation context with', userMessages.length, 'messages');
            } catch (contextError) {
              console.error('Failed to rebuild conversation context:', contextError);
              // This is non-fatal - user can still continue with the conversation
            }
          }
        }
      } else {
        // Create a new conversation if none exists
        await createNewConversation();
      }
    } catch (error) {
      console.error('Error loading conversation:', error);
    }
  };
  
  const createNewConversation = async () => {
    try {
      // First reset Gemini's conversation context
      await geminiAPI.resetChat();

      // Then create a new conversation in our local storage
      // New conversations should be at the top of the list, so we use the default updateTimestamp=true
      const newConversation = await conversationStorage.createConversation();
      setCurrentConversation(newConversation);
      setMessages([]);
      // Close the history drawer immediately
      setShowHistory(false);
      
      if (isInitialized && Object.keys(allTools).length > 0) {
        // Re-initialize Gemini with system instructions
        const systemInstruction = generateSystemInstruction(allTools);
        await geminiAPI.sendSystemInstruction(systemInstruction);
        
        const systemMessage = {
          id: Date.now().toString(),
          role: 'system' as const,
          content: 'New conversation started.',
          timestamp: new Date(),
          fadeAnim: new Animated.Value(0),
          isNew: true
        };
        
        setMessages([systemMessage]);
        
        // Animate the system message
        Animated.timing(systemMessage.fadeAnim!, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      }
    } catch (error) {
      console.error('Error creating new conversation:', error);
    }
  };
  
  const saveCurrentMessages = async (updateTimestamp: boolean = false) => {
    if (!currentConversation) return;
    
    try {
      await conversationStorage.saveMessages(
        currentConversation.id, 
        messages as MessageData[],
        updateTimestamp
      );
    } catch (error) {
      console.error('Error saving messages:', error);
    }
  };
  
  const handleSelectConversation = async (conversation: Conversation) => {
    try {
      // First reset Gemini's conversation context
      await geminiAPI.resetChat();
      
      // Then update UI immediately for better perceived performance
      setCurrentConversation(conversation);
      
      // Convert stored messages to the Message format
      const loadedMessages: Message[] = conversation.messages.map(msg => ({
        ...msg,
        timestamp: typeof msg.timestamp === 'string' ? new Date(msg.timestamp) : msg.timestamp,
        fadeAnim: new Animated.Value(1), // Already loaded messages should be visible
        isNew: false
      }));
      
      // Set messages immediately
      setMessages(loadedMessages);
      
      // Close the history drawer immediately
      setShowHistory(false);
      
      // Start background initialization without blocking the UI
      Promise.resolve().then(async () => {
        try {
          setLoading(true);
          
          // Update current conversation ID without updating the timestamp
          // This ensures the conversation doesn't move to the top of the list
          await conversationStorage.setCurrentConversation(conversation.id, false);
          
          // Add system instruction initialization if needed
          if (Object.keys(allTools).length > 0) {
            const systemInstruction = generateSystemInstruction(allTools);
            await geminiAPI.sendSystemInstruction(systemInstruction);
          }
        } catch (initError) {
          console.error('Error in background initialization:', initError);
        } finally {
          setLoading(false);
        }
      });
      
      // Don't wait for background tasks to complete
    } catch (error) {
      console.error('Error loading conversation:', error);
      setLoading(false);
    }
  };

  const checkInitialization = async () => {
    try {
      // Check if MCP Bridge URL and Gemini API key are set
      const mcpUrl = await mcpBridgeAPI.getBaseUrl();
      const geminiKey = await geminiAPI.getApiKey();

      if (!mcpUrl || !geminiKey) {
        setIsInitialized(false);
        return;
      }

      setLoading(true);
      
      // Initialize Gemini
      await geminiAPI.initialize();
      
      // Fetch servers and tools
      const servers = await mcpBridgeAPI.getServers();
      
      // Get tools for each server
      const toolsMap: {[serverId: string]: any[]} = {};
      for (const server of servers) {
        const tools = await mcpBridgeAPI.getTools(server.id);
        toolsMap[server.id] = tools;
      }
      
      setAllTools(toolsMap);
      
      // If there are tools, send system instruction to Gemini
      if (Object.keys(toolsMap).length > 0) {
        const systemInstruction = generateSystemInstruction(toolsMap);
        await geminiAPI.sendSystemInstruction(systemInstruction);
      }
      
      setIsInitialized(true);
    } catch (error) {
      console.error('Initialization error:', error);
      setIsInitialized(false);
    } finally {
      setLoading(false);
    }
  };

  const addNewMessage = (message: Omit<Message, 'fadeAnim' | 'isNew'>) => {
    const fadeAnim = new Animated.Value(0);
    const messageWithAnimation: Message = {
      ...message,
      fadeAnim,
      isNew: true
    };
    
    setMessages(prev => [...prev, messageWithAnimation]);
    
    // Start fade-in animation
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
    
    return messageWithAnimation;
  };

  const updateMessage = (messageId: string, updates: Partial<Message>) => {
    setMessages(prev => 
      prev.map(msg => 
        msg.id === messageId 
          ? { ...msg, ...updates }
          : msg
      )
    );
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    if (!isInitialized) {
      alert('Please configure MCP Bridge and Gemini API settings first');
      return;
    }

    // Get current input value before clearing it
    const currentMessage = input.trim();

    // Add user message with animation
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: currentMessage,
      timestamp: new Date()
    };

    // Add user message with animation
    addNewMessage(userMessage);
    setInput('');
    setLoading(true);

    // When sending a new message, update the conversation's position in the list
    if (currentConversation) {
      // Save messages with updateTimestamp=true to move conversation to top of list
      await saveCurrentMessages(true);
    }

    let firstAssistantMessageId: string | null = null;

    try {
      // Check if this is the first user message in a new conversation
      const isFirstMessage = currentConversation && 
                            currentConversation.title === 'New Conversation' && 
                            messages.filter(m => m.role === 'user').length === 0;
      
      // Send message to Gemini
      const response = await geminiAPI.sendMessage(currentMessage);
      
      // Parse the response
      const parsedResponse = parseLLMResponse(response);
      
      // Create assistant message - potentially including tool call
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: parsedResponse.response,
        timestamp: new Date(),
        segments: [
          {
            id: Date.now().toString(),
            type: 'text',
            content: parsedResponse.response
          }
        ],
        toolCall: parsedResponse.tool_call ? {
          serverId: parsedResponse.tool_call.server_id || '',
          toolName: parsedResponse.tool_call.tool_name || '',
          parameters: parsedResponse.tool_call.parameters
        } : undefined // Use undefined instead of null if no tool call
      };
      
      // Store the ID of this message to potentially update it later
      firstAssistantMessageId = assistantMessage.id;

      // Add the initial assistant message (with potential tool call) with animation
      addNewMessage(assistantMessage);

      // If this is the first message, generate and update the title
      if (isFirstMessage && currentConversation) {
        try {
          // Generate title using AI
          const aiTitle = await geminiAPI.generateChatTitle(currentMessage);
          
          // Update conversation title
          await conversationStorage.updateConversationTitle(currentConversation.id, aiTitle);
          
          // Update the current conversation object
          setCurrentConversation(prev => prev ? {...prev, title: aiTitle} : null);
        } catch (error) {
          console.error('Error generating title:', error);
          // Title will fallback to the default behavior in conversationStorage.saveMessages
        }
      }

      // If there's a tool call, execute it and pass the message ID
      if (assistantMessage.toolCall && 
          assistantMessage.toolCall.serverId && 
          assistantMessage.toolCall.toolName) {
        await executeTool(
          assistantMessage.id, // Pass the ID
          assistantMessage.toolCall.serverId,
          assistantMessage.toolCall.toolName,
          assistantMessage.toolCall.parameters
        );
      } else {
        // If no tool call, we are done loading for this turn
        setLoading(false);
      }

    } catch (error) {
      console.error('Error sending message:', error);
      // Add error message with animation
      addNewMessage({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, there was an error processing your request.',
        timestamp: new Date()
      });
      setLoading(false); // Ensure loading stops on error
    }
    // Removed setLoading(false) from finally block as it's handled within the try/catch paths
  };

  const executeTool = async (assistantMessageId: string, serverId: string, toolName: string, parameters: any) => {
    try {
      // setLoading(true) is already active from handleSend
      console.log(`[Tool Execution] Starting to execute tool ${toolName} on server ${serverId}`);
      
      // Execute the tool
      const result = await mcpBridgeAPI.executeTool(serverId, toolName, parameters);
      console.log(`[Tool Execution] Result received:`, JSON.stringify(result).substring(0, 200) + "...");
      
      // --- Confirmation Flow Handling --- 
      if (result.requires_confirmation) {
        console.log(`[Confirmation] Tool requires confirmation. Risk level: ${result.risk_level}`);
        
        // Store confirmation data in the message instead of in a separate state
        // This way, we can access it directly from the message when rendering
        const confirmationInfo = {
          confirmation_id: result.confirmation_id,
          server_id: result.server_id, 
          tool_name: result.tool_name,
          method: result.method || 'UNKNOWN',
          risk_level: result.risk_level || 1,
          risk_description: result.risk_description || 'Unknown risk'
        };
        
        // Update the message to include confirmation UI
        updateMessage(assistantMessageId, {
          requiresConfirmation: true,
          confirmationInfo: confirmationInfo,
          confirmationStatus: 'pending' // can be 'pending', 'confirmed', 'rejected'
        });
        
        // Loading stops here until user confirms/rejects in the UI
        setLoading(false); 
        return; // Exit early, handleConfirmation will be called from the UI
      }
      // --- End Confirmation Flow --- 

      // Create a tool operation object
      const toolOperation = {
        id: Date.now().toString(),
        toolCall: {
          serverId,
          toolName,
          parameters
        },
        toolResult: result
      };
      
      // Create a segment for this tool operation
      const toolSegment: MessageSegment = {
        id: Date.now().toString(),
        type: 'tool',
        toolOperation: toolOperation
      };
      
      // Add the tool operation segment to the existing message
      setMessages(prev => 
        prev.map(msg => 
          msg.id === assistantMessageId 
            ? { 
                ...msg, 
                segments: [...(msg.segments || []), toolSegment]
              } 
            : msg
        )
      );
      
      // Send feedback to Gemini
      const feedback = `The tool ${toolName} was executed successfully. Result: ${JSON.stringify(result)}`;
      console.log(`[Tool Execution] Sending feedback to Gemini`);
      const response = await geminiAPI.sendMessage(feedback);
      const parsedResponse = parseLLMResponse(response);
      
      // Create a text segment for the AI's response
      const textSegment: MessageSegment = {
        id: Date.now() + 1 + '',
        type: 'text',
        content: parsedResponse.response
      };
      
      // Add the AI response segment
      setMessages(prev => 
        prev.map(msg => 
          msg.id === assistantMessageId 
            ? { 
                ...msg, 
                segments: [...(msg.segments || []), textSegment],
                content: msg.content ? `${msg.content}\n\n${parsedResponse.response}` : parsedResponse.response
              } 
            : msg
        )
      );
      
      // If there's another tool call in the response, handle it
      if (parsedResponse.tool_call && 
          parsedResponse.tool_call.server_id && 
          parsedResponse.tool_call.tool_name) {
        console.log(`[Tool Execution] Found another tool call in response, executing...`);
        await executeTool(
          assistantMessageId, // Continue using the same message ID for all tool calls
          parsedResponse.tool_call.server_id || '',
          parsedResponse.tool_call.tool_name || '',
          parsedResponse.tool_call.parameters
        );
      } else {
        // We're done with this interaction
        console.log(`[Tool Execution] No more tool calls, finishing...`);
        setLoading(false);
      }

    } catch (error) {
      console.error(`[Tool Execution ERROR] Error executing tool ${toolName}:`, error);
      
      // Create an error segment
      const errorSegment: MessageSegment = {
        id: Date.now().toString(),
        type: 'text',
        content: `**Error executing ${toolName}:**\n\n${error instanceof Error ? error.message : String(error)}`
      };
      
      // Add the error segment
      setMessages(prev => 
        prev.map(msg => 
          msg.id === assistantMessageId 
            ? { 
                ...msg, 
                segments: [...(msg.segments || []), errorSegment],
                content: `${msg.content}\n\n**Error executing ${toolName}:**\n\n${error instanceof Error ? error.message : String(error)}`
              } 
            : msg
        )
      );
      
      setLoading(false);
    }
  };

  const handleMessageConfirmation = async (messageId: string, confirmationInfo: any, confirm: boolean) => {
    try {
      console.log(`[Confirmation] User ${confirm ? 'confirmed' : 'rejected'} operation for message ${messageId}`);
      
      // Mark the message as processing
      setLoading(true);
      
      // Update the message's confirmation status immediately for better UX
      updateMessage(messageId, {
        confirmationStatus: confirm ? 'confirmed' : 'rejected'
      });
      
      console.log(`[Confirmation] Sending confirmation to MCP Bridge: ${confirmationInfo.confirmation_id}, confirm=${confirm}`);
      
      // Execute the confirmation API call
      const result = await mcpBridgeAPI.confirmOperation(confirmationInfo.confirmation_id, confirm);
      console.log(`[Confirmation] Result:`, JSON.stringify(result).substring(0, 200) + "...");
      
      // If confirmed, add a tool operation segment
      if (confirm) {
        const toolOperation = {
          id: Date.now().toString(),
          toolCall: {
            serverId: confirmationInfo.server_id,
            toolName: confirmationInfo.tool_name,
            parameters: {}
          },
          toolResult: result
        };
        
        // Create a segment for this tool operation
        const toolSegment: MessageSegment = {
          id: Date.now().toString(),
          type: 'tool',
          toolOperation: toolOperation
        };
        
        // Add the tool operation segment to the message
        setMessages(prev => 
          prev.map(msg => 
            msg.id === messageId 
              ? { 
                  ...msg, 
                  segments: [...(msg.segments || []), toolSegment]
                } 
              : msg
          )
        );
      }
      
      // Send feedback to Gemini
      let feedback = '';
      if (confirm) {
        feedback = `The operation was confirmed by the user and executed successfully. Result: ${JSON.stringify(result)}`;
      } else {
        feedback = `The operation was cancelled by the user: ${result.message || 'No reason provided'}`;
      }
      
      console.log(`[Confirmation] Sending feedback to Gemini`);
      const response = await geminiAPI.sendMessage(feedback);
      const parsedResponse = parseLLMResponse(response);
      
      // Create a text segment for the AI's response
      const textSegment: MessageSegment = {
        id: Date.now() + 1 + '',
        type: 'text',
        content: parsedResponse.response
      };
      
      // Add the AI response text segment
      setMessages(prev => 
        prev.map(msg => 
          msg.id === messageId 
            ? { 
                ...msg, 
                segments: [...(msg.segments || []), textSegment],
                content: msg.content ? `${msg.content}\n\n${parsedResponse.response}` : parsedResponse.response
              } 
            : msg
        )
      );
      
      // Save the updated conversation and update its timestamp 
      // to move it to the top when user takes action
      await saveCurrentMessages(true);
      
      // Check if the AI is asking for another tool call
      if (confirm && parsedResponse.tool_call && 
          parsedResponse.tool_call.server_id && 
          parsedResponse.tool_call.tool_name) {
        console.log(`[Confirmation] AI requested another tool call after confirmation`);
        await executeTool(
          messageId,
          parsedResponse.tool_call.server_id || '',
          parsedResponse.tool_call.tool_name || '',
          parsedResponse.tool_call.parameters
        );
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.error(`[Confirmation ERROR] Failed to handle confirmation:`, error);
      
      // Create an error segment
      const errorSegment: MessageSegment = {
        id: Date.now().toString(),
        type: 'text',
        content: `**Confirmation Error:**\n\n${error instanceof Error ? error.message : String(error)}`
      };
      
      // Add the error segment
      setMessages(prev => 
        prev.map(msg => 
          msg.id === messageId 
            ? { 
                ...msg, 
                segments: [...(msg.segments || []), errorSegment],
                content: `${msg.content}\n\n**Confirmation Error:**\n\n${error instanceof Error ? error.message : String(error)}`
              } 
            : msg
        )
      );
      
      // In case of error, save the messages anyway but don't update timestamp
      await saveCurrentMessages(false);
      setLoading(false);
    }
  };

  const renderMessage = (message: Message) => {
    // We don't need this section anymore since toolOperations are now embedded within regular messages
    if (message.isToolOperation) {
      return null;
    }

    // Modern chat bubble design
    const isUser = message.role === 'user';
    const isSystem = message.role === 'system';
    const textColor = isUser ? '#FFFFFF' : '#E0E0E0';
    
    return (
      <Animated.View
        key={message.id}
        style={{
          opacity: message.fadeAnim || 1,
          transform: [{
            translateY: message.fadeAnim ? message.fadeAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [20, 0]
            }) : 0
          }]
        }}
      >
        <View style={[
          styles.messageContainer,
          isUser ? styles.userMessageContainer : styles.assistantMessageContainer,
          isSystem && styles.systemMessageContainer
        ]}>
          {/* Full-width message with gradient effect */}
          <View style={[
            styles.messageBubble,
            isUser ? styles.userBubble : styles.assistantBubble,
            isSystem && styles.systemBubble
          ]}>
            {/* Gradient overlay for visual effect */}
            {!isSystem && (
              <View style={[
                styles.gradientOverlay,
                isUser ? styles.userGradientOverlay : styles.assistantGradientOverlay
              ]} />
            )}
            
            <View style={styles.messageContent}>
            {/* Inline Avatar for non-system messages */}
            {!isSystem && (
              <View style={styles.inlineAvatarContainer}>
                <View style={[
                  styles.inlineAvatar,
                  isUser ? styles.userInlineAvatar : styles.assistantInlineAvatar
                ]}>
                  <MaterialCommunityIcons 
                    name={isUser ? "account" : "robot"} 
                    size={10} 
                    color={isUser ? '#FFFFFF' : '#4CAF50'} 
                  />
                </View>
                <Text style={[
                  styles.roleLabel,
                  isUser ? styles.userRoleLabel : styles.assistantRoleLabel
                ]} selectable>
                  {isUser ? 'You' : 'Assistant'}
                </Text>
              </View>
            )}
            
            {/* If we have segments, render those in sequence */}
            {message.segments && message.segments.length > 0 ? (
              <>
                {message.segments.map((segment, index) => (
                  <React.Fragment key={segment.id}>
                    {/* Text segment */}
                    {segment.type === 'text' && segment.content && (
            <Markdown 
              onLinkPress={(url) => {
                Linking.openURL(url);
                return false;
              }}
              style={{ 
                body: { },
                heading1: {
                  color: textColor,
                  borderBottomWidth: 1,
                  borderBottomColor: 'rgba(255, 255, 255, 0.1)',
                  paddingBottom: 8,
                  marginBottom: 16,
                  fontSize: 24,
                  fontWeight: 'bold',
                },
                heading2: {
                  color: textColor,
                  marginTop: 20,
                  marginBottom: 12,
                  fontSize: 20,
                  fontWeight: 'bold',
                },
                heading3: {
                  color: textColor,
                  marginTop: 16,
                  marginBottom: 8,
                  fontSize: 18,
                  fontWeight: 'bold',
                },
                paragraph: {
                  marginVertical: 8,
                  color: textColor,
                  fontSize: 15,
                },
                link: {
                  color: isUser ? '#E1BEE7' : theme.colors.primary,
                  textDecorationLine: 'underline',
                },
                // List styling improvements
                list_item: {
                  marginVertical: 2,
                },
                bullet_list: {
                  marginVertical: 8,
                },
                ordered_list: {
                  marginVertical: 8,
                },
                list_item_text: {
                  color: textColor,
                  marginVertical: 4,
                },
                // Bullet and number styling
                bullet_list_icon: {
                  color: textColor,
                  fontSize: 15,
                },
                ordered_list_icon: {
                  color: textColor,
                  fontSize: 15,
                },
                // List content styling
                list_item_content: {
                  color: textColor,
                },
                code_inline: {
                  color: isUser ? '#E1BEE7' : theme.colors.primary,
                  backgroundColor: 'rgba(187, 134, 252, 0.1)',
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 4,
                  fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                  fontSize: 14,
                },
                code_block: {
                  backgroundColor: 'rgba(0, 0, 0, 0.3)',
                  padding: 12,
                  borderRadius: 8,
                  marginVertical: 8,
                },
                fence: {
                  backgroundColor: 'rgba(0, 0, 0, 0.3)',
                  padding: 12,
                  borderRadius: 8,
                  marginVertical: 8,
                },
                blockquote: {
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  borderLeftColor: isUser ? '#E1BEE7' : theme.colors.primary,
                  borderLeftWidth: 4,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  marginVertical: 8,
                },
                table: {
                  borderWidth: 1,
                  borderColor: 'rgba(255, 255, 255, 0.2)',
                  borderRadius: 4,
                  marginVertical: 8,
                },
                thead: {
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                },
                th: {
                  padding: 8,
                  color: textColor,
                  fontWeight: 'bold',
                  borderWidth: 1,
                  borderColor: 'rgba(255, 255, 255, 0.2)',
                },
                td: {
                  padding: 8,
                  color: textColor,
                  borderWidth: 1,
                  borderColor: 'rgba(255, 255, 255, 0.2)',
                },
                tr: {
                  borderBottomWidth: 1,
                  borderBottomColor: 'rgba(255, 255, 255, 0.2)',
                },
                image: {
                  maxWidth: '100%',
                  borderRadius: 4,
                  marginVertical: 8,
                },
                hr: {
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  height: 1,
                  marginVertical: 16,
                },
                strong: {
                  fontWeight: 'bold',
                  color: textColor,
                },
                em: {
                  fontStyle: 'italic',
                  color: textColor,
                },
                code_block_text: {
                  fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                  color: textColor,
                },
                fence_text: {
                  fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                  color: textColor,
                },
                blockquote_text: {
                  color: textColor,
                },
                text: {
                  color: textColor,
                  fontSize: 15,
                  lineHeight: 22,
                },
              }}
            >
                        {segment.content}
            </Markdown>
                    )}
            
                    {/* Tool operation segment */}
                    {segment.type === 'tool' && segment.toolOperation && (
                      <View style={[styles.toolSection, index > 0 ? {marginTop: 8, marginBottom: 8} : {}]}>
                        {/* Tool calls and results */}
              <TouchableOpacity 
                          style={styles.toolHeader}
                          onPress={() => toggleResultCollapse(`${message.id}-${segment.toolOperation!.id}-tools`)}
              >
                  <MaterialCommunityIcons 
                            name="console-line" 
                            size={18} 
                            color="#BB86FC" 
                          />
                          <Text style={styles.toolSectionTitle} selectable> Called {segment.toolOperation.toolCall.toolName.replace(/_/g, ' ')}</Text>
                          <MaterialCommunityIcons 
                            name={collapsedResults[`${message.id}-${segment.toolOperation!.id}-tools`] !== false ? "chevron-down" : "chevron-up"} 
                    size={20} 
                            color="#BB86FC"
                    style={styles.collapseIcon}
                  />
                        </TouchableOpacity>

                        {collapsedResults[`${message.id}-${segment.toolOperation!.id}-tools`] === false && (
                          <View style={styles.toolsContainer}>
                            {/* Tool Call */}
                            {segment.toolOperation.toolCall && (
                              <View style={styles.toolOperation}>
                                <View style={styles.toolOperationHeader}>
                                  <MaterialCommunityIcons name="tools" size={16} color="#BB86FC" />
                                  <Text style={styles.toolOperationTitle} selectable>Tool Call</Text>
                                </View>
                                <View style={styles.toolOperationDetails}>
                                  <View style={styles.toolOperationRow}>
                                    <Text style={styles.toolOperationLabel} selectable>Server:</Text>
                                    <Text style={styles.toolOperationValue} selectable>{segment.toolOperation.toolCall.serverId}</Text>
                                  </View>
                                  <View style={styles.toolOperationRow}>
                                    <Text style={styles.toolOperationLabel} selectable>Tool:</Text>
                                    <Text style={styles.toolOperationValue} selectable>{segment.toolOperation.toolCall.toolName}</Text>
                                  </View>
                                  {segment.toolOperation.toolCall.parameters && Object.keys(segment.toolOperation.toolCall.parameters).length > 0 && (
                                    <View style={styles.toolOperationRow}>
                                      <Text style={styles.toolOperationLabel} selectable>Params:</Text>
                                      <TouchableOpacity 
                                        style={styles.paramsToggle}
                                        onPress={() => toggleResultCollapse(`${message.id}-${segment.toolOperation!.id}-params`)}
                                      >
                                        <Text style={{color: '#BB86FC'}} selectable>
                                          {collapsedResults[`${message.id}-${segment.toolOperation!.id}-params`] !== false ? "Show" : "Hide"} parameters
                      </Text>
                                        <MaterialCommunityIcons 
                                          name={collapsedResults[`${message.id}-${segment.toolOperation!.id}-params`] !== false ? "chevron-down" : "chevron-up"} 
                                          size={16} 
                                          color="#BB86FC"
                                          style={{marginLeft: 4}}
                                        />
                                      </TouchableOpacity>
                                    </View>
                                  )}
                                  {segment.toolOperation.toolCall.parameters && 
                                   Object.keys(segment.toolOperation.toolCall.parameters).length > 0 && 
                                   collapsedResults[`${message.id}-${segment.toolOperation!.id}-params`] === false && (
                                    <View style={styles.codeBlock}>
                                      <Text style={styles.codeText} selectable>
                                        {JSON.stringify(segment.toolOperation.toolCall.parameters, null, 2)}
                      </Text>
                    </View>
                                  )}
                                </View>
                              </View>
                            )}

                            {/* Tool Result */}
                            {segment.toolOperation.toolResult && (
                              <View style={styles.toolOperation}>
                                <View style={styles.toolOperationHeader}>
                                  <MaterialCommunityIcons name="checkbox-marked-circle-outline" size={16} color="#BB86FC" />
                                  <Text style={styles.toolOperationTitle} selectable>Tool Result</Text>
                                </View>
                                <View style={styles.toolOperationDetails}>
                                  <TouchableOpacity 
                                    style={styles.paramsToggle}
                                    onPress={() => toggleResultCollapse(`${message.id}-${segment.toolOperation!.id}-result`)}
                                  >
                                    <Text style={{color: '#BB86FC'}} selectable>
                                      {collapsedResults[`${message.id}-${segment.toolOperation!.id}-result`] !== false ? "Show" : "Hide"} result
                                    </Text>
                                    <MaterialCommunityIcons 
                                      name={collapsedResults[`${message.id}-${segment.toolOperation!.id}-result`] !== false ? "chevron-down" : "chevron-up"} 
                                      size={16} 
                                      color="#BB86FC"
                                      style={{marginLeft: 4}}
                                    />
                                  </TouchableOpacity>
                                  {collapsedResults[`${message.id}-${segment.toolOperation!.id}-result`] === false && (
                        <View style={styles.codeBlock}>
                                      <Text style={styles.codeText} selectable>
                                        {JSON.stringify(segment.toolOperation.toolResult, null, 2)}
                          </Text>
                                    </View>
                                  )}
                        </View>
                      </View>
                    )}
                          </View>
                        )}
                      </View>
                    )}
                  </React.Fragment>
                ))}
              </>
            ) : (
              // Fallback to the old content rendering if no segments
              <Markdown 
                onLinkPress={(url) => {
                  Linking.openURL(url);
                  return false;
                }}
                style={{ 
                  body: { },
                  heading1: {
                    color: textColor,
                    borderBottomWidth: 1,
                    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
                    paddingBottom: 8,
                    marginBottom: 16,
                    fontSize: 24,
                    fontWeight: 'bold',
                  },
                  heading2: {
                    color: textColor,
                    marginTop: 20,
                    marginBottom: 12,
                    fontSize: 20,
                    fontWeight: 'bold',
                  },
                  heading3: {
                    color: textColor,
                    marginTop: 16,
                    marginBottom: 8,
                    fontSize: 18,
                    fontWeight: 'bold',
                  },
                  paragraph: {
                    marginVertical: 8,
                    color: textColor,
                    fontSize: 15,
                  },
                  link: {
                    color: isUser ? '#E1BEE7' : theme.colors.primary,
                    textDecorationLine: 'underline',
                  },
                  // Style for the list item container
                  list_item: { },
                  // Style for unordered lists (bullets)
                  bullet_list: {
                    marginVertical: 8,
                  },
                  // Style for ordered lists (numbers)
                  ordered_list: {
                    marginVertical: 8,
                  },
                  // Style for the actual text in list items
                  list_item_text: {
                    color: textColor,
                    marginVertical: 4,
                    fontSize: 15,
                  },
                  // Bullet and number styling
                  bullet_list_icon: {
                    color: textColor,
                    fontSize: 15,
                  },
                  ordered_list_icon: {
                    color: textColor,
                    fontSize: 15,
                  },
                  // List content styling
                  list_item_content: {
                    color: textColor,
                  },
                  code_inline: {
                    color: isUser ? '#E1BEE7' : theme.colors.primary,
                    backgroundColor: 'rgba(187, 134, 252, 0.1)',
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 4,
                    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                    fontSize: 14,
                  },
                  code_block: {
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    padding: 12,
                    borderRadius: 8,
                    marginVertical: 8,
                  },
                  fence: {
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    padding: 12,
                    borderRadius: 8,
                    marginVertical: 8,
                  },
                  blockquote: {
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    borderLeftColor: isUser ? '#E1BEE7' : theme.colors.primary,
                    borderLeftWidth: 4,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    marginVertical: 8,
                  },
                  table: {
                    borderWidth: 1,
                    borderColor: 'rgba(255, 255, 255, 0.2)',
                    borderRadius: 4,
                    marginVertical: 8,
                  },
                  thead: {
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  },
                  th: {
                    padding: 8,
                    color: textColor,
                    fontWeight: 'bold',
                    borderWidth: 1,
                    borderColor: 'rgba(255, 255, 255, 0.2)',
                  },
                  td: {
                    padding: 8,
                    color: textColor,
                    borderWidth: 1,
                    borderColor: 'rgba(255, 255, 255, 0.2)',
                  },
                  tr: {
                    borderBottomWidth: 1,
                    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
                  },
                  image: {
                    maxWidth: '100%',
                    borderRadius: 4,
                    marginVertical: 8,
                  },
                  hr: {
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    height: 1,
                    marginVertical: 16,
                  },
                  strong: {
                    fontWeight: 'bold',
                    color: textColor,
                  },
                  em: {
                    fontStyle: 'italic',
                    color: textColor,
                  },
                  // Add text styling for code_block, fence and blockquote
                  code_block_text: {
                    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                    color: textColor,
                  },
                  fence_text: {
                    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                    color: textColor,
                  },
                  blockquote_text: {
                    color: textColor,
                  },
                  // Ensure all text is visible in dark mode
                  text: {
                    color: textColor,
                    fontSize: 15,
                    lineHeight: 22,
                  },
                }}
              >
                {message.content}
              </Markdown>
            )}
            
            {/* Inline Confirmation UI for pending confirmation */}
            {message.requiresConfirmation && message.confirmationInfo && message.confirmationStatus === 'pending' && (
              <View style={styles.confirmationContainer}>
                <View style={styles.confirmationHeader}>
                  <MaterialCommunityIcons name="shield-key" size={20} color="#BB86FC" />
                  <Text style={styles.confirmationHeaderText} selectable>Confirmation Required</Text>
                </View>
                
                <View style={styles.confirmationDetails}>
                  {/* Operation details */}
                  <View style={styles.confirmationRow}>
                    <MaterialCommunityIcons name="console" size={16} color="#BB86FC" style={styles.rowIcon} />
                    <Text style={styles.confirmationLabel} selectable>Operation:</Text>
                    <Text style={styles.confirmationValue} selectable>{message.confirmationInfo.method || 'Unknown'}</Text>
                  </View>
                  
                  <View style={styles.confirmationRow}>
                    <MaterialCommunityIcons name="server" size={16} color="#BB86FC" style={styles.rowIcon} />
                    <Text style={styles.confirmationLabel} selectable>Server:</Text>
                    <Text style={styles.confirmationValue} selectable>{message.confirmationInfo.server_id || 'Unknown'}</Text>
                  </View>
                  
                  <View style={styles.confirmationRow}>
                    <MaterialCommunityIcons name="tools" size={16} color="#BB86FC" style={styles.rowIcon} />
                    <Text style={styles.confirmationLabel} selectable>Tool:</Text>
                    <Text style={styles.confirmationValue} selectable>{message.confirmationInfo.tool_name || 'Unknown'}</Text>
                  </View>
                  
                  <View style={styles.confirmationRow}>
                  <MaterialCommunityIcons 
                      name={message.confirmationInfo.risk_level >= 3 ? "alert-circle" : 
                             message.confirmationInfo.risk_level >= 2 ? "alert" : "shield-check"} 
                      size={16} 
                      color={message.confirmationInfo.risk_level >= 3 ? "#ff5252" : 
                             message.confirmationInfo.risk_level >= 2 ? "#ffab40" : "#81c784"}
                      style={styles.rowIcon}
                    />
                    <Text style={styles.confirmationLabel} selectable>Risk Level:</Text>
                    <Text style={[
                      styles.confirmationValue,
                      { color: message.confirmationInfo.risk_level >= 3 ? '#ff5252' : 
                              message.confirmationInfo.risk_level >= 2 ? '#ffab40' : '#81c784' }
                    ]} selectable>
                      {message.confirmationInfo.risk_level || '?'} 
                      {message.confirmationInfo.risk_description ? ` (${message.confirmationInfo.risk_description})` : ''}
                    </Text>
                  </View>
                </View>
                
                <Text style={styles.confirmationHelpText} selectable>
                  This operation requires explicit confirmation before proceeding.
                    </Text>
                
                <View style={styles.confirmationActions}>
                  <TouchableOpacity 
                    style={styles.confirmationRejectButton}
                    onPress={() => handleMessageConfirmation(message.id, message.confirmationInfo, false)}
                    disabled={loading}
                  >
                    <MaterialCommunityIcons name="close-circle" size={18} color="#ff5252" style={{marginRight: 6}} />
                    <Text style={styles.confirmationRejectText} selectable>Reject</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={styles.confirmationApproveButton}
                    onPress={() => handleMessageConfirmation(message.id, message.confirmationInfo, true)}
                    disabled={loading}
                  >
                    <MaterialCommunityIcons name="check-circle" size={18} color="#BB86FC" style={{marginRight: 6}} />
                    <Text style={styles.confirmationApproveText} selectable>Approve</Text>
                  </TouchableOpacity>
                </View>
                  </View>
            )}
            
            {/* Timestamp */}
            <View style={styles.messageFooter}>
              <Text style={[
                styles.timestamp,
                isUser ? styles.userTimestamp : styles.assistantTimestamp
              ]} selectable>
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            </View>
          </View>
        </View>
      </Animated.View>
    );
  };

  const loadServersAndTools = async () => {
    try {
      // Get all servers
      const servers = await mcpBridgeAPI.getServers();
      
      // Get tools for each server
      const toolsMap: {[serverId: string]: any[]} = {};
      for (const server of servers) {
        const tools = await mcpBridgeAPI.getTools(server.id);
        toolsMap[server.id] = tools;
      }
      
      setAllTools(toolsMap);
      
      // If there are tools, send system instruction to Gemini
      if (Object.keys(toolsMap).length > 0) {
        const systemInstruction = generateSystemInstruction(toolsMap);
        await geminiAPI.sendSystemInstruction(systemInstruction);
        
        // Only add a system message if explicitly requested (like during refreshTools)
        // Do not add it during initialization or when loading an existing conversation
      }
      
      return toolsMap;
    } catch (error) {
      console.error('Error loading servers and tools:', error);
      throw error;
    }
  };

  const toggleResultCollapse = (messageId: string) => {
    // Default is collapsed (true), so we need to toggle between false (expanded) and undefined/true (collapsed)
    setCollapsedResults(prev => ({
      ...prev,
      [messageId]: prev[messageId] === false ? undefined : false
    }));
  };

  const resetChat = async () => {
    try {
      // Ask for confirmation
      if (messages.length > 1) {
        // Only ask for confirmation if there are user messages
        Alert.alert(
          'Reset Chat',
          'Are you sure you want to reset this chat? This will clear all messages in the current conversation.',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Reset', 
              style: 'destructive', 
              onPress: async () => performReset()
            },
          ]
        );
      } else {
        await performReset();
      }
    } catch (error) {
      console.error('Error resetting chat:', error);
      alert('Error resetting chat: ' + (error instanceof Error ? error.message : String(error)));
    }
  };
  
  const performReset = async () => {
    setLoading(true);
    
    try {
      await geminiAPI.resetChat();
      
      // Create a new conversation
      await createNewConversation();
      
      // If there are tools, send system instruction again
      if (Object.keys(allTools).length > 0) {
        const systemInstruction = generateSystemInstruction(allTools);
        await geminiAPI.sendSystemInstruction(systemInstruction);
      }
    } catch (error) {
      console.error('Error performing reset:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshTools = async () => {
    try {
      setLoading(true);
      // Get the tools without any system message being added
      await loadServersAndTools();
      
      // Only add the refresh message if we have a current conversation
      if (currentConversation) {
        // Now explicitly add our refresh message
        const refreshMessage: Message = {
          id: Date.now().toString(),
          role: 'system',
          content: 'Tools refreshed from MCP Bridge.',
          timestamp: new Date()
        };
        
        setMessages(prev => [...prev, refreshMessage]);
        
        // Make sure we save this message to the current conversation
        // We need to wait for the state to update, so we queue this
        setTimeout(async () => {
          // Don't update timestamp for system messages
          await saveCurrentMessages(false);
        }, 100);
      }
    } catch (error) {
      console.error('Error refreshing tools:', error);
      
      if (currentConversation) {
        const errorMessage: Message = {
          id: Date.now().toString(),
          role: 'system',
          content: `Error refreshing tools: ${error instanceof Error ? error.message : String(error)}`,
          timestamp: new Date()
        };
        
        setMessages(prev => [...prev, errorMessage]);
        
        // Make sure we save this error message to the current conversation
        setTimeout(async () => {
          // Don't update timestamp for system messages
          await saveCurrentMessages(false);
        }, 100);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isInitialized && !loading) {
    return (
      <View style={[styles.centeredContainer, { backgroundColor: theme.colors.background }]}>
        <Text style={[styles.notConfiguredText, { color: theme.colors.onBackground }]}>
          Please configure MCP Bridge and Gemini API settings first
        </Text>
        <Button mode="contained" onPress={checkInitialization}>
          Try Again
        </Button>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Chat header with conversation title and actions */}
      <View style={[styles.header, { borderBottomColor: 'rgba(255, 255, 255, 0.07)' }]}>
        <TouchableOpacity 
          style={styles.historyButton}
          onPress={() => setShowHistory(true)}
        >
          <MaterialCommunityIcons name="menu" size={24} color={theme.colors.onSurface} />
        </TouchableOpacity>
        
        <Text 
          style={styles.conversationTitle}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {currentConversation?.title || 'New Chat'}
        </Text>
        
        <View style={styles.headerActions}>
          <IconButton
            icon="refresh"
            size={22}
            onPress={resetChat}
            disabled={loading}
            style={styles.actionIcon}
          />
          <Link href="/modal" asChild>
            <IconButton
              icon="information-outline"
              size={22}
              style={styles.actionIcon}
              iconColor={theme.colors.primary}
            />
          </Link>
        </View>
      </View>
      
      {/* Main content area with proper layout */}
      <View style={styles.contentContainer}>
        {/* Scrollable message area */}
        <ScrollView 
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
        >
          {messages.map(renderMessage)}
          
          {loading && (
            <ActivityIndicator size="large" style={styles.loader} color={theme.colors.primary} />
          )}
          
          {/* Add padding at bottom to ensure last message is visible above input */}
          <View style={styles.bottomSpacer} />
        </ScrollView>
        
        {/* Fixed input area at bottom */}
        <View style={styles.inputContainerWrapper}>
          <View style={[
            styles.inputContainer, 
            { 
              borderTopColor: 'rgba(255, 255, 255, 0.15)', 
              backgroundColor: '#121212',
            }
          ]}>
            <View style={styles.textInputWrapper}>
              <TextInput
                style={styles.input}
                placeholder={loading ? 'Please wait, processing...' : 'Type a message...'}
                placeholderTextColor="#888"
                value={input}
                onChangeText={setInput}
                editable={!loading}
                multiline
              />
            </View>
            <IconButton
              icon="send"
              size={24}
              iconColor={theme.colors.primary}
              onPress={handleSend}
              disabled={loading || !input.trim()}
              style={styles.sendButton}
            />
          </View>
        </View>
      </View>
      
      <Portal>
        {/* Conversation history drawer */}
        <Modal
          visible={showHistory}
          onDismiss={() => setShowHistory(false)}
          contentContainerStyle={styles.drawer}
          dismissable={true}
          dismissableBackButton={true}
        >
          <ConversationHistory 
            onSelectConversation={handleSelectConversation}
            onNewConversation={createNewConversation}
            currentConversationId={currentConversation?.id}
          />
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  notConfiguredText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20
  },
  // Modern chat bubble styles
  messageContainer: {
    marginVertical: 8,
    paddingHorizontal: 0, // Remove horizontal padding for full width
  },
  userMessageContainer: {
    // Full width container
  },
  assistantMessageContainer: {
    // Full width container
  },
  systemMessageContainer: {
    justifyContent: 'center',
    marginVertical: 12,
    paddingHorizontal: 16,
  },
  messageBubble: {
    width: '100%', // Full screen width
    paddingHorizontal: 20,
    paddingVertical: 16,
    position: 'relative',
    minHeight: 60,
  },
  userBubble: {
    backgroundColor: '#1E1B4B', // Very dark purple base
    borderLeftWidth: 6,
    borderLeftColor: '#8B5CF6', // Purple accent
    shadowColor: '#8B5CF6',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
  },
  assistantBubble: {
    backgroundColor: '#0F172A', // Very dark slate
    borderLeftWidth: 6,
    borderLeftColor: '#64748B', // Slate accent
    shadowColor: '#1E293B',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.7,
    shadowRadius: 12,
    elevation: 8,
  },
  systemBubble: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    alignSelf: 'center',
    maxWidth: '90%',
  },
  messageContent: {
    // Container for message content
  },
  userTimestamp: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  assistantTimestamp: {
    color: 'rgba(255, 255, 255, 0.5)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
  },
  conversationTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
    color: '#fff',
  },
  historyButton: {
    padding: 8,
  },
  actionIcon: {
    margin: 0,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  contentContainer: {
    flex: 1,
    position: 'relative',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 8,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 120 : 100, // Space for input area
  },
  drawer: {
    backgroundColor: '#121212',
    flex: 1,
    margin: 0,
    padding: 0,
    width: '100%',
    height: '100%',
  },
  messageCard: {
    marginBottom: 16,
    borderRadius: 12,
  },
  toolSection: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(187, 134, 252, 0.3)',
    backgroundColor: 'rgba(187, 134, 252, 0.05)',
    borderRadius: 8,
    overflow: 'hidden',
  },
  toolHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(187, 134, 252, 0.1)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(187, 134, 252, 0.2)',
  },
  toolSectionTitle: {
    color: '#BB86FC',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 6,
  },
  toolsContainer: {
    padding: 12,
  },
  toolOperation: {
    marginBottom: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 6,
    overflow: 'hidden',
  },
  toolOperationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  toolOperationTitle: {
    color: '#BB86FC',
    fontWeight: 'bold',
    fontSize: 14,
    marginLeft: 6,
  },
  toolOperationDetails: {
    padding: 10,
  },
  toolOperationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  toolOperationLabel: {
    color: '#E9E9E9',
    fontWeight: 'bold',
    width: 70,
    fontSize: 13,
  },
  toolOperationValue: {
    color: '#fff',
    flex: 1,
    fontSize: 13,
  },
  paramsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  confirmationStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  confirmationStatusText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  errorBlock: {
    padding: 10,
    backgroundColor: 'rgba(255, 82, 82, 0.1)',
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#ff5252',
  },
  errorText: {
    color: '#ff5252',
    fontSize: 13,
  },
  messageFooter: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  timestamp: {
    fontSize: 12,
    opacity: 0.6,
    color: '#fff',
  },
  inputContainerWrapper: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 85 : 65, // Account for tab bar
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'transparent',
    zIndex: 999,
  },
  inputContainer: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderTopWidth: 1,
    alignItems: 'center',
    borderRadius: 25,
    backgroundColor: '#121212',
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  textInputWrapper: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginRight: 8,
    paddingHorizontal: 4,
    overflow: 'hidden',
    minHeight: 36,
    maxHeight: 80,
  },
  input: {
    backgroundColor: 'transparent',
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 20,
  },
  sendButton: {
    marginLeft: 4,
    marginRight: 2,
  },
  loader: {
    marginVertical: 20
  },
  bottomSpacer: {
    height: 20, // Minimal space since we use proper padding now
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  collapseIcon: {
    marginLeft: 'auto',
  },
  rowIcon: {
    marginRight: 8,
  },
  codeBlock: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    padding: 12,
    borderRadius: 6,
  },
  codeText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    color: '#E9E9E9',
  },
  confirmationContainer: {
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(187, 134, 252, 0.3)',
    borderRadius: 8,
    backgroundColor: 'rgba(187, 134, 252, 0.05)',
    marginVertical: 12,
  },
  confirmationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(187, 134, 252, 0.2)',
    paddingBottom: 8,
  },
  confirmationHeaderText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#BB86FC',
    marginLeft: 8,
  },
  confirmationDetails: {
    marginBottom: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 6,
    padding: 12,
  },
  confirmationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  confirmationLabel: {
    fontWeight: 'bold',
    color: '#E9E9E9',
    marginRight: 8,
    width: 80,
  },
  confirmationValue: {
    color: '#fff',
    flex: 1,
  },
  confirmationHelpText: {
    color: '#E9E9E9',
    marginTop: 12,
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  confirmationActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  confirmationRejectButton: {
    flexDirection: 'row',
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 82, 82, 0.3)',
    borderRadius: 8,
    backgroundColor: 'rgba(255, 82, 82, 0.1)',
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmationRejectText: {
    color: '#ff5252',
    fontWeight: 'bold',
  },
  confirmationApproveButton: {
    flexDirection: 'row',
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(187, 134, 252, 0.3)',
    borderRadius: 8,
    backgroundColor: 'rgba(187, 134, 252, 0.15)',
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmationApproveText: {
    color: '#BB86FC',
    fontWeight: 'bold',
  },
  inlineAvatarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  inlineAvatar: {
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  userInlineAvatar: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  assistantInlineAvatar: {
    backgroundColor: 'rgba(76, 175, 80, 0.8)',
  },
  roleLabel: {
    fontSize: 11,
    fontWeight: '600',
    opacity: 0.8,
  },
  userRoleLabel: {
    color: '#FFFFFF',
  },
  assistantRoleLabel: {
    color: '#E0E0E0',
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.6,
  },
  userGradientOverlay: {
    backgroundColor: '#4C1D95', // Darker purple overlay
  },
  assistantGradientOverlay: {
    backgroundColor: '#111827', // Very dark overlay
  },
}); 
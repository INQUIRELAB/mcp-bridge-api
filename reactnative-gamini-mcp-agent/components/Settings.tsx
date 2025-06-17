import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { Button, TextInput, Text, Snackbar, Card, Title, useTheme, RadioButton, Divider, Dialog, Portal, Switch } from 'react-native-paper';
import { mcpBridgeAPI } from '../services/api';
import { geminiAPI } from '../services/gemini';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Define available Gemini models based on the latest documentation
const GEMINI_MODELS = [
  {
    name: 'Gemini 2.5 Flash Preview 05-20',
    value: 'gemini-2.5-flash-preview-05-20',
    description: 'Audio, images, videos, and text | Adaptive thinking, cost efficiency',
    category: 'Latest',
    isDefault: true
  },
  {
    name: 'Gemini 2.5 Pro Preview',
    value: 'gemini-2.5-pro-preview-05-06',
    description: 'Enhanced thinking and reasoning, multimodal understanding, advanced coding',
    category: 'Latest'
  },
  {
    name: 'Gemini 2.0 Flash',
    value: 'gemini-2.0-flash',
    description: 'Next generation features, speed, thinking, and realtime streaming',
    category: 'Stable'
  },
  {
    name: 'Gemini 2.0 Flash Preview Image Generation',
    value: 'gemini-2.0-flash-preview-image-generation',
    description: 'Conversational image generation and editing',
    category: 'Preview'
  },
  {
    name: 'Gemini 2.0 Flash-Lite',
    value: 'gemini-2.0-flash-lite',
    description: 'Cost efficiency and low latency',
    category: 'Stable'
  },
  {
    name: 'Gemini 1.5 Flash',
    value: 'gemini-1.5-flash',
    description: 'Fast and versatile performance across a diverse variety of tasks',
    category: 'Stable'
  },
  {
    name: 'Gemini 1.5 Flash-8B',
    value: 'gemini-1.5-flash-8b',
    description: 'High volume and lower intelligence tasks',
    category: 'Stable'
  },
  {
    name: 'Gemini 1.5 Pro',
    value: 'gemini-1.5-pro',
    description: 'Complex reasoning tasks requiring more intelligence',
    category: 'Stable'
  },
  {
    name: 'Custom Model',
    value: 'custom',
    description: 'Specify your own model name',
    category: 'Custom'
  }
];

export default function Settings() {
  const theme = useTheme();
  const [mcpBridgeUrl, setMcpBridgeUrl] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [geminiModel, setGeminiModel] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<{ status?: string; serverCount?: number; servers?: any[] } | null>(null);
  
  // Model selection state
  const [selectedModelValue, setSelectedModelValue] = useState('gemini-2.5-flash-preview-05-20');
  const [showModelsDialog, setShowModelsDialog] = useState(false);
  const [customModelName, setCustomModelName] = useState('');

  useEffect(() => {
    // Load saved settings
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      // Load MCP Bridge URL
      const savedUrl = await mcpBridgeAPI.getBaseUrl();
      if (savedUrl) {
        setMcpBridgeUrl(savedUrl);
        // Try to get health info
        checkHealth();
      }

      // Load Gemini settings
      const savedApiKey = await geminiAPI.getApiKey();
      if (savedApiKey) {
        setGeminiApiKey(savedApiKey);
      }

      const savedModel = await geminiAPI.getModelName();
      if (savedModel) {
        setGeminiModel(savedModel);
        
        // Find if it's one of our predefined models
        const matchedModel = GEMINI_MODELS.find(model => model.value === savedModel);
        if (matchedModel) {
          setSelectedModelValue(matchedModel.value);
        } else {
          // If it's not a predefined model, set to custom
          setSelectedModelValue('custom');
          setCustomModelName(savedModel);
        }
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      showSnackbar('Error loading settings');
    }
  };

  const checkHealth = async () => {
    try {
      setLoading(true);
      const healthData = await mcpBridgeAPI.checkHealth();
      setHealth(healthData);
      setLoading(false);
    } catch (error) {
      console.error('Health check failed:', error);
      setHealth(null);
      setLoading(false);
      showSnackbar('MCP Bridge connection failed');
    }
  };

  const saveMcpBridgeUrl = async () => {
    try {
      setLoading(true);
      await mcpBridgeAPI.setBaseUrl(mcpBridgeUrl.trim());
      // Check health after setting URL
      await checkHealth();
      showSnackbar('MCP Bridge URL saved');
    } catch (error) {
      console.error('Failed to save MCP Bridge URL:', error);
      showSnackbar('Failed to save MCP Bridge URL');
    } finally {
      setLoading(false);
    }
  };

  const saveGeminiSettings = async () => {
    try {
      setLoading(true);
      // Initialize with new API key
      await geminiAPI.initialize(geminiApiKey.trim());
      
      // Determine which model to use
      let modelToSave = selectedModelValue;
      if (selectedModelValue === 'custom') {
        modelToSave = customModelName.trim();
      }
      
      // Set the model
      await geminiAPI.setModel(modelToSave || 'gemini-2.5-flash-preview-05-20');
      setGeminiModel(modelToSave);
      showSnackbar('Gemini settings saved');
    } catch (error) {
      console.error('Failed to save Gemini settings:', error);
      showSnackbar('Failed to save Gemini settings');
    } finally {
      setLoading(false);
    }
  };

  const showSnackbar = (message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  const getSelectedModelName = () => {
    if (selectedModelValue === 'custom') {
      return customModelName || 'Custom Model Name';
    }
    
    const model = GEMINI_MODELS.find(m => m.value === selectedModelValue);
    return model ? model.name : selectedModelValue;
  };

  const renderModelsByCategory = () => {
    const categories = ['Latest', 'Stable', 'Preview', 'Custom'];
    
    return categories.map(category => {
      const modelsInCategory = GEMINI_MODELS.filter(model => model.category === category);
      if (modelsInCategory.length === 0) return null;

      return (
        <View key={category}>
          <Text style={[styles.categoryHeader, { color: theme.colors.primary }]}>
            {category}
          </Text>
          {modelsInCategory.map((model, index) => (
            <View key={model.value}>
              <View style={styles.modelOption}>
                <View style={styles.modelOptionContent}>
                  <RadioButton value={model.value} />
                  <View style={styles.modelInfo}>
                    <View style={styles.modelNameRow}>
                      <Text style={[styles.modelName, { color: theme.colors.onSurface }]}>
                        {model.name}
                      </Text>
                      {model.isDefault && (
                        <View style={[styles.defaultBadge, { backgroundColor: theme.colors.primary }]}>
                          <Text style={styles.defaultBadgeText}>DEFAULT</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.modelDesc, { color: theme.colors.onSurface }]}>
                      {model.description}
                    </Text>
                    {model.value !== 'custom' && (
                      <Text style={[styles.modelId, { color: theme.colors.onSurface }]}>
                        {model.value}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
              {index < modelsInCategory.length - 1 && <Divider />}
            </View>
          ))}
        </View>
      );
    });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* MCP Bridge Settings */}
        <Card style={[styles.card, styles.modernCard]}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="server-network" size={24} color={theme.colors.primary} />
              <Title style={[styles.cardTitle, { color: theme.colors.onSurface }]}>
                MCP Bridge Connection
              </Title>
            </View>
            <TextInput
              label="MCP Bridge URL"
              value={mcpBridgeUrl}
              onChangeText={setMcpBridgeUrl}
              mode="outlined"
              placeholder="http://localhost:3000"
              style={styles.input}
              left={<TextInput.Icon icon="link" />}
            />
            <Button
              mode="contained"
              onPress={saveMcpBridgeUrl}
              loading={loading}
              disabled={loading || !mcpBridgeUrl}
              style={styles.button}
              icon="connection"
            >
              Connect to MCP Bridge
            </Button>

            {health && (
              <View style={[styles.healthInfo, { backgroundColor: 'rgba(187, 134, 252, 0.1)' }]}>
                <View style={styles.healthHeader}>
                  <MaterialCommunityIcons name="check-circle" size={20} color="#4CAF50" />
                  <Text style={[styles.healthTitle, { color: theme.colors.onSurface }]}>
                    MCP Bridge Status
                  </Text>
                </View>
                <View style={styles.healthDetails}>
                  <Text style={[styles.healthText, { color: theme.colors.onSurface }]}>
                    Status: {health.status}
                  </Text>
                  <Text style={[styles.healthText, { color: theme.colors.onSurface }]}>
                    Server Count: {health.serverCount}
                  </Text>
                </View>
                
                {health.servers && health.servers.length > 0 && (
                  <View style={styles.serversSection}>
                    <Text style={[styles.serversTitle, { color: theme.colors.onSurface }]}>
                      Connected Servers:
                    </Text>
                    {health.servers.map((server, index) => (
                      <View key={index} style={styles.serverItem}>
                        <MaterialCommunityIcons name="server" size={16} color={theme.colors.primary} />
                        <Text style={[styles.serverText, { color: theme.colors.onSurface }]}>
                          {server.id} (Risk Level: {server.risk_level || 'N/A'})
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </Card.Content>
        </Card>

        {/* Gemini API Settings */}
        <Card style={[styles.card, styles.modernCard]}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="robot" size={24} color={theme.colors.primary} />
              <Title style={[styles.cardTitle, { color: theme.colors.onSurface }]}>
                Gemini API Settings
              </Title>
            </View>
            <TextInput
              label="Gemini API Key"
              value={geminiApiKey}
              onChangeText={setGeminiApiKey}
              mode="outlined"
              secureTextEntry
              placeholder="Enter your Gemini API key"
              style={styles.input}
              left={<TextInput.Icon icon="key" />}
            />
            
            {/* Model selection UI */}
            <Text style={[styles.inputLabel, { color: theme.colors.onSurface }]}>
              Gemini Model
            </Text>
            <TouchableOpacity 
              style={[styles.modernSelector, { borderColor: theme.colors.primary }]}
              onPress={() => setShowModelsDialog(true)}
            >
              <View style={styles.selectorContent}>
                <MaterialCommunityIcons name="brain" size={20} color={theme.colors.primary} />
                <Text style={[styles.selectorText, { color: theme.colors.onSurface }]}>
                  {getSelectedModelName()}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-down" size={24} color={theme.colors.primary} />
            </TouchableOpacity>
            
            {selectedModelValue === 'custom' && (
              <TextInput
                label="Custom Model Name"
                value={customModelName}
                onChangeText={setCustomModelName}
                mode="outlined"
                placeholder="Enter custom model name"
                style={styles.input}
                left={<TextInput.Icon icon="pencil" />}
              />
            )}
            
            <Button
              mode="contained"
              onPress={saveGeminiSettings}
              loading={loading}
              disabled={loading || !geminiApiKey || (selectedModelValue === 'custom' && !customModelName)}
              style={styles.button}
              icon="content-save"
            >
              Save Gemini Settings
            </Button>
          </Card.Content>
        </Card>
      </ScrollView>
      
      {/* Model selection dialog */}
      <Portal>
        <Dialog 
          visible={showModelsDialog} 
          onDismiss={() => setShowModelsDialog(false)}
          style={styles.dialog}
        >
          <Dialog.Title style={{ color: theme.colors.onSurface }}>
            Select Gemini Model
          </Dialog.Title>
          <Dialog.ScrollArea style={{ paddingHorizontal: 0, maxHeight: 500 }}>
            <ScrollView>
              <RadioButton.Group onValueChange={value => {
                setSelectedModelValue(value);
                setShowModelsDialog(false);
              }} value={selectedModelValue}>
                {renderModelsByCategory()}
              </RadioButton.Group>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setShowModelsDialog(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
        style={{ backgroundColor: theme.colors.surface }}
      >
        <Text style={{ color: theme.colors.onSurface }}>{snackbarMessage}</Text>
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContainer: {
    padding: 16,
    paddingTop: Platform.OS === 'android' ? 50 : 16, // Extra top padding for Android status bar
    paddingBottom: 100, // Extra space for tab bar
  },
  card: {
    marginBottom: 20,
  },
  modernCard: {
    borderRadius: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    marginLeft: 12,
    fontSize: 20,
    fontWeight: '600',
  },
  input: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
    marginTop: 8,
  },
  button: {
    marginTop: 8,
    borderRadius: 12,
  },
  modernSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    backgroundColor: 'rgba(187, 134, 252, 0.05)',
  },
  selectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  selectorText: {
    marginLeft: 12,
    fontSize: 16,
    flex: 1,
  },
  healthInfo: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(187, 134, 252, 0.3)',
  },
  healthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  healthTitle: {
    fontWeight: '600',
    fontSize: 16,
    marginLeft: 8,
  },
  healthDetails: {
    marginBottom: 12,
  },
  healthText: {
    fontSize: 14,
    marginBottom: 4,
  },
  serversSection: {
    marginTop: 8,
  },
  serversTitle: {
    fontWeight: '600',
    marginBottom: 8,
  },
  serverItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  serverText: {
    marginLeft: 8,
    fontSize: 14,
  },
  dialog: {
    maxHeight: '80%',
  },
  categoryHeader: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
    marginLeft: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  modelOption: {
    padding: 12,
  },
  modelOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modelInfo: {
    flex: 1,
    marginLeft: 12,
  },
  modelNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  modelName: {
    fontWeight: '600',
    fontSize: 16,
    flex: 1,
  },
  defaultBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 8,
  },
  defaultBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  modelDesc: {
    fontSize: 13,
    opacity: 0.8,
    marginBottom: 4,
    lineHeight: 18,
  },
  modelId: {
    fontSize: 12,
    opacity: 0.6,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
}); 
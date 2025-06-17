import React, { useEffect, useState } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { Text, useTheme, Card, IconButton, Surface, Title, Searchbar } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { conversationStorage, Conversation } from '../services/conversationStorage';
import { format } from 'date-fns';

interface ConversationHistoryProps {
  onSelectConversation: (conversation: Conversation) => void;
  onNewConversation: () => void;
  currentConversationId?: string;
}

const ConversationHistory: React.FC<ConversationHistoryProps> = ({ 
  onSelectConversation, 
  onNewConversation,
  currentConversationId 
}) => {
  const theme = useTheme();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredConversations, setFilteredConversations] = useState<Conversation[]>([]);
  
  useEffect(() => {
    loadConversations();
  }, []);
  
  useEffect(() => {
    if (searchQuery) {
      const filtered = conversations.filter(conversation => 
        conversation.title.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredConversations(filtered);
    } else {
      setFilteredConversations(conversations);
    }
  }, [searchQuery, conversations]);
  
  const loadConversations = async () => {
    const allConversations = await conversationStorage.getAllConversations();
    setConversations(allConversations);
    setFilteredConversations(allConversations);
  };
  
  const handleDeleteConversation = (id: string) => {
    Alert.alert(
      'Delete Conversation',
      'Are you sure you want to delete this conversation? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive', 
          onPress: async () => {
            await conversationStorage.deleteConversation(id);
            loadConversations();
          } 
        },
      ]
    );
  };
  
  const renderItem = ({ item }: { item: Conversation }) => {
    const isSelected = currentConversationId === item.id;
    
    return (
      <Surface 
        style={[
          styles.conversationItem, 
          isSelected && { backgroundColor: 'rgba(138, 43, 226, 0.1)' }
        ]}
      >
        <TouchableOpacity 
          style={styles.conversationContent}
          onPress={() => onSelectConversation(item)}
        >
          <View style={styles.conversationDetails}>
            <Text
              style={[styles.conversationTitle, isSelected && { color: theme.colors.primary }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {item.title}
            </Text>
            <Text 
              style={styles.conversationDate}
              numberOfLines={1}
            >
              {format(new Date(item.updatedAt), 'MMM d, yyyy • h:mm a')}
            </Text>
            <Text 
              style={styles.messageCount}
              numberOfLines={1}
            >
              {item.messages.filter(m => m.role !== 'system').length} messages
            </Text>
          </View>
          
          <IconButton
            icon="delete-outline"
            size={20}
            onPress={() => handleDeleteConversation(item.id)}
            style={styles.deleteButton}
          />
        </TouchableOpacity>
      </Surface>
    );
  };
  
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <Title style={styles.historyTitle}>Conversations</Title>
        <IconButton
          icon="plus"
          mode="contained"
          size={24}
          onPress={onNewConversation}
          containerColor={theme.colors.primary}
          iconColor="#fff"
        />
      </View>
      
      <Searchbar
        placeholder="Search conversations"
        onChangeText={setSearchQuery}
        value={searchQuery}
        style={styles.searchBar}
        iconColor={theme.colors.onSurface}
        inputStyle={{ color: theme.colors.onSurface }}
      />
      
      {filteredConversations.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons
            name="chat-outline"
            size={50}
            color={theme.colors.onSurface}
            style={{ opacity: 0.5 }}
          />
          <Text style={styles.emptyText}>
            {conversations.length === 0 
              ? "No conversations yet. Start a new one!"
              : "No matching conversations found"}
          </Text>
          {conversations.length === 0 && (
            <TouchableOpacity 
              style={[styles.newConversationButton, { backgroundColor: theme.colors.primary }]}
              onPress={onNewConversation}
            >
              <Text style={styles.newConversationText}>New Conversation</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={filteredConversations}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  historyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  searchBar: {
    marginBottom: 16,
    marginHorizontal: 16,
    elevation: 0,
    borderRadius: 12,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  conversationItem: {
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 1,
  },
  conversationContent: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
  },
  conversationDetails: {
    flex: 1,
  },
  conversationTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  conversationDate: {
    fontSize: 12,
    opacity: 0.6,
    marginBottom: 2,
  },
  messageCount: {
    fontSize: 12,
    opacity: 0.6,
  },
  deleteButton: {
    margin: 0,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 100,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    opacity: 0.6,
    textAlign: 'center',
    marginHorizontal: 32,
    marginBottom: 24,
  },
  newConversationButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  newConversationText: {
    color: 'white',
    fontWeight: '600',
  },
});

export default ConversationHistory; 
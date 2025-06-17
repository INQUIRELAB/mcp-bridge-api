import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, Linking } from 'react-native';
import { View, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, Title, Paragraph, Text, useTheme } from 'react-native-paper';

export default function ModalScreen() {
  const router = useRouter();
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Card style={styles.card}>
          <Card.Content>
            <Title style={styles.title}>MCP Bridge Agent</Title>
            <Paragraph style={styles.paragraph}>
              This app connects to MCP Bridge and uses Google's Gemini API to process user requests and execute MCP tools commands. It is made by Arash Ahmadi, who is studying PhD in electrical and computer engineering at the University of Oklahoma.
            </Paragraph>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Title style={styles.sectionTitle}>Features</Title>
            <View style={styles.featureItem}>
              <Text style={styles.bulletPoint}>•</Text>
              <Paragraph style={styles.featureText}>Multi-step reasoning with sequential tool calls</Paragraph>
            </View>
            <View style={styles.featureItem}>
              <Text style={styles.bulletPoint}>•</Text>
              <Paragraph style={styles.featureText}>Security confirmation flow for medium and high risk operations</Paragraph>
            </View>
            <View style={styles.featureItem}>
              <Text style={styles.bulletPoint}>•</Text>
              <Paragraph style={styles.featureText}>Automatic discovery of allowed directories for file operations</Paragraph>
            </View>
            <View style={styles.featureItem}>
              <Text style={styles.bulletPoint}>•</Text>
              <Paragraph style={styles.featureText}>Configurable MCP Bridge URL and port</Paragraph>
            </View>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Title style={styles.sectionTitle}>Getting Started</Title>
            <Paragraph style={styles.paragraph}>
              1. Go to the Settings tab and enter your MCP Bridge URL
            </Paragraph>
            <Paragraph style={styles.paragraph}>
              2. Enter your Gemini API key to enable AI capabilities
            </Paragraph>
            <Paragraph style={styles.paragraph}>
              3. Return to the Chat tab and start interacting with MCP tools through natural language
            </Paragraph>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Title style={styles.sectionTitle}>About MCP Bridge</Title>
            <Paragraph style={styles.paragraph}>
              MCP Bridge is a lightweight, LLM-agnostic proxy that connects to multiple Model Context Protocol servers and exposes their capabilities through a unified REST API.
            </Paragraph>
            <Button
              mode="outlined"
              onPress={() => Linking.openURL('https://github.com/INQUIRELAB/mcp-bridge-api')}
              style={styles.button}
            >
              Learn More
            </Button>
          </Card.Content>
        </Card>

        <Button
          mode="contained"
          onPress={() => router.back()}
          style={styles.closeButton}
        >
          Close
        </Button>
      </ScrollView>

      {/* Always use light status bar (white text on dark background) */}
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  card: {
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 20,
    marginBottom: 12,
  },
  paragraph: {
    fontSize: 16,
    marginBottom: 8,
  },
  featureItem: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  bulletPoint: {
    fontSize: 16,
    marginRight: 8,
  },
  featureText: {
    fontSize: 16,
    flex: 1,
  },
  button: {
    marginTop: 12,
  },
  closeButton: {
    marginTop: 16,
  },
}); 
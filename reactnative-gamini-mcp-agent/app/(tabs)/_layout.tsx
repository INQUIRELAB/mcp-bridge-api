import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, StatusBar, View, StyleSheet } from 'react-native';
import { useTheme, Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';

import { HapticTab } from '@/components/HapticTab';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

// Modern tab bar background with glassmorphism effect
const ModernTabBackground = () => {
  return (
    <View style={styles.tabBackground} />
  );
};

// Custom tab button component with modern design
function TabButton({ 
  focused, 
  icon, 
  label, 
  color 
}: { 
  focused: boolean; 
  icon: string; 
  label: string;
  color: string;
}) {
  return (
    <View style={styles.tabContainer}>
      {/* Modern icon container with background */}
      <View style={[
        styles.iconContainer,
        focused && styles.iconContainerFocused
      ]}>
        <Ionicons 
          name={focused ? icon as any : `${icon}-outline` as any}
          size={20} 
          color={focused ? '#FFFFFF' : color} 
        />
      </View>
      
      {/* Label with modern styling to the right */}
      <Text 
        style={[
          styles.tabLabel, 
          { color: focused ? '#FFFFFF' : color },
          focused && styles.tabLabelFocused
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const theme = useTheme();

  // Set status bar to light (white text) for dark theme
  React.useEffect(() => {
    StatusBar.setBarStyle('light-content');
  }, []);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: 'rgba(255, 255, 255, 0.5)',
        headerShown: false,
        tabBarBackground: () => <ModernTabBackground />,
        tabBarStyle: styles.tabBar,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Chat',
          tabBarButton: (props) => (
            <HapticTab
              {...props}
              testID="tab-chat"
            >
              <TabButton
                focused={props.accessibilityState?.selected || false}
                icon="chatbubble"
                label="Chat"
                color={props.accessibilityState?.selected ? theme.colors.primary : 'rgba(255, 255, 255, 0.5)'}
              />
            </HapticTab>
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Settings',
          tabBarButton: (props) => (
            <HapticTab
              {...props}
              testID="tab-settings"
            >
              <TabButton
                focused={props.accessibilityState?.selected || false}
                icon="settings"
                label="Settings"
                color={props.accessibilityState?.selected ? theme.colors.primary : 'rgba(255, 255, 255, 0.5)'}
              />
            </HapticTab>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBackground: {
    position: 'absolute',
    height: '100%',
    width: '100%',
    backgroundColor: 'rgba(18, 18, 18, 0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    backdropFilter: 'blur(20px)', // CSS blur effect
  },
  tabBar: {
    position: 'absolute',
    height: Platform.OS === 'ios' ? 65 : 60,
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    paddingTop: 6,
    paddingBottom: Platform.OS === 'ios' ? 20 : 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 15,
  },
  tabContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  iconContainer: {
    height: 36,
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  iconContainerFocused: {
    backgroundColor: 'rgba(187, 134, 252, 0.8)',
    shadowColor: '#BB86FC',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 8,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  tabLabelFocused: {
    fontWeight: '700',
    textShadowColor: 'rgba(187, 134, 252, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  }
});

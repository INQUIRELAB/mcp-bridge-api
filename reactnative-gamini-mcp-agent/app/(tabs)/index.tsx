import React from 'react';
import { StyleSheet, View, StatusBar, Platform } from 'react-native';
import ChatComponent from '../../components/ChatComponent';

export default function TabOneScreen() {
  return (
    <View style={styles.container}>
      <StatusBar 
        barStyle="light-content" 
        backgroundColor="transparent" 
        translucent={Platform.OS === 'android'}
      />
      <ChatComponent />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

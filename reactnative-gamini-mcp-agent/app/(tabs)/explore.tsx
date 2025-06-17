import React from 'react';
import { StyleSheet, View, StatusBar } from 'react-native';
import { useTheme } from 'react-native-paper';
import Settings from '../../components/Settings';

export default function TabTwoScreen() {
  const theme = useTheme();
  
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor="#121212" />
      <Settings />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

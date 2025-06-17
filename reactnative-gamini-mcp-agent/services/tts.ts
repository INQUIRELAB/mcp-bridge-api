import { GoogleGenAI } from '@google/genai';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { Platform } from 'react-native';
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system';

let genAI: GoogleGenAI | null = null;

// TTS API service
export const ttsAPI = {
  // Initialize TTS with API key
  initialize: async (apiKey?: string) => {
    try {
      // If API key is provided, use it, otherwise get from storage
      if (!apiKey) {
        const storedApiKey = await AsyncStorage.getItem('geminiApiKey');
        if (!storedApiKey) {
          throw new Error('Gemini API key not found');
        }
        apiKey = storedApiKey;
      }

      // Initialize the new Gemini API
      genAI = new GoogleGenAI({ apiKey: apiKey });
      
      console.log('Initialized TTS with new GoogleGenAI library');
      return true;
    } catch (error) {
      console.error('Failed to initialize TTS API:', error);
      throw error;
    }
  },

  // Check if TTS is enabled
  isEnabled: async (): Promise<boolean> => {
    try {
      const enabled = await AsyncStorage.getItem('ttsEnabled');
      return enabled ? JSON.parse(enabled) : false;
    } catch (error) {
      console.error('Failed to check TTS enabled status:', error);
      return false;
    }
  },

  // Get TTS settings
  getSettings: async () => {
    try {
      const enabled = await AsyncStorage.getItem('ttsEnabled');
      const model = await AsyncStorage.getItem('ttsModel');
      const voice = await AsyncStorage.getItem('ttsVoice');
      
      return {
        enabled: enabled ? JSON.parse(enabled) : false,
        model: model || 'gemini-2.5-flash-preview-tts',
        voice: voice || 'Kore'
      };
    } catch (error) {
      console.error('Failed to get TTS settings:', error);
      return {
        enabled: false,
        model: 'gemini-2.5-flash-preview-tts',
        voice: 'Kore'
      };
    }
  },

  // Convert text to speech and play it
  speak: async (text: string): Promise<void> => {
    try {
      // Check if TTS is enabled
      const settings = await ttsAPI.getSettings();
      if (!settings.enabled) {
        console.log('TTS is disabled');
        return;
      }

      console.log('Converting text to speech:', text.substring(0, 100) + '...');

      // Check if user prefers Gemini TTS (stored in settings)
      const useGeminiTTS = await AsyncStorage.getItem('useGeminiTTS');
      const preferGeminiTTS = useGeminiTTS ? JSON.parse(useGeminiTTS) : false;

      if (preferGeminiTTS) {
        // Try Gemini TTS first if user prefers it
        try {
          await ttsAPI.useGeminiTTS(text, settings);
          return;
        } catch (geminiError) {
          console.log('Gemini TTS failed, falling back to device TTS:', geminiError);
        }
      }

      // Use device TTS (primary option)
      await Speech.speak(text, {
        language: 'en-US',
        pitch: 1.0,
        rate: 0.85, // Slightly slower for better clarity
        voice: undefined // Use default voice
      });
      console.log('Successfully used device TTS');

    } catch (error) {
      console.error('All TTS methods failed:', error);
    }
  },

  // Separate method for Gemini TTS
  useGeminiTTS: async (text: string, settings: any): Promise<void> => {
    // Initialize if needed
    if (!genAI) {
      await ttsAPI.initialize();
    }

    if (!genAI) {
      throw new Error('TTS API not initialized');
    }

    // Get the TTS model name
    const ttsModelName = await AsyncStorage.getItem('ttsModel') || 'gemini-2.5-flash-preview-tts';

    // Use the exact API format from the documentation
    console.log('Making Gemini TTS request with model:', ttsModelName, 'voice:', settings.voice);
    
    const response = await genAI.models.generateContent({
      model: ttsModelName,
      contents: [{ 
        parts: [{ text: text }] 
      }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { 
              voiceName: settings.voice 
            }
          }
        }
      }
    });

    console.log('Gemini TTS response received:', {
      candidatesLength: response.candidates?.length,
      firstCandidate: response.candidates?.[0],
      parts: response.candidates?.[0]?.content?.parts
    });

    // Get the audio data exactly as shown in the documentation
    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    
    if (!audioData) {
      throw new Error('No audio data received from Gemini TTS API');
    }

    await ttsAPI.playAudio(audioData);
  },

  // Play audio from base64 data
  playAudio: async (base64Data: string): Promise<void> => {
    try {
      console.log('Attempting to play audio from base64 data...');
      
      // Set audio mode for playback
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      // Create a temporary file to save the audio
      const filename = `${FileSystem.cacheDirectory}temp_audio_${Date.now()}.wav`;
      
      console.log('Saving audio to temporary file:', filename);
      
      // Write the base64 data to a file
      await FileSystem.writeAsStringAsync(filename, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      console.log('Audio file saved, attempting to play...');

      // Create and play the sound from the file
      const { sound } = await Audio.Sound.createAsync(
        { uri: filename },
        { shouldPlay: true, volume: 1.0 }
      );

      console.log('Audio loaded successfully, playing...');

      // Clean up when finished
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.isLoaded && status.didJustFinish) {
          console.log('Audio playback finished, cleaning up...');
          sound.unloadAsync();
          // Clean up the temporary file
          FileSystem.deleteAsync(filename, { idempotent: true }).catch(err => 
            console.log('Failed to delete temp file:', err)
          );
        }
      });

    } catch (error) {
      console.error('Failed to play audio:', error);
      throw error;
    }
  },

  // Stop any currently playing audio
  stopAudio: async (): Promise<void> => {
    try {
      // Stop device TTS
      Speech.stop();
      
      // Reset audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
        playsInSilentModeIOS: false,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });
    } catch (error) {
      console.error('Failed to stop audio:', error);
    }
  }
}; 
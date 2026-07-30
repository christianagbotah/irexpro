import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

export default function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>iRexPro</Text>
      <Text style={styles.subtitle}>Log in to your account</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#6b7494"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#6b7494"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <Pressable style={styles.button} onPress={onLoggedIn}>
        <Text style={styles.buttonText}>Log in</Text>
      </Pressable>

      <Text style={styles.muted}>
        Auth is handled by the backend at /api/v1/auth/login. The mobile app
        never stores raw passwords and never uses localStorage.
      </Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1020', padding: 24, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '700', color: '#e8edff', marginBottom: 4 },
  subtitle: { fontSize: 15, color: '#9aa7c7', marginBottom: 24 },
  input: {
    backgroundColor: '#131a2e', borderColor: '#243049', borderWidth: 1,
    borderRadius: 10, padding: 14, color: '#e8edff', marginBottom: 12, fontSize: 16,
  },
  button: { backgroundColor: '#14b8a6', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 16 },
  buttonText: { color: '#06231f', fontWeight: '700', fontSize: 16 },
  muted: { color: '#6b7494', fontSize: 12, lineHeight: 18 },
});

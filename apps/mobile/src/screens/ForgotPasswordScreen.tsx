import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from 'react-native';

export default function ForgotPasswordScreen({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setLoading(true);
    // Sprint 26: backend does NOT yet have POST /auth/forgot-password.
    // Show a safe generic message — do not expose whether the email exists.
    await new Promise((r) => setTimeout(r, 800));
    setSubmitted(true);
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>Forgot password</Text>
      <Text style={styles.subtitle}>
        Enter your email to receive reset instructions
      </Text>

      {submitted ? (
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            If an account exists for this email, password reset instructions will
            be sent once password recovery is enabled. This feature will be
            available in the next update.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              Password recovery is not yet available. This form will be activated
              once the backend endpoint is ready.
            </Text>
          </View>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#6b7494"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Pressable style={styles.button} onPress={handleSubmit} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#06231f" />
            ) : (
              <Text style={styles.buttonText}>Send reset link</Text>
            )}
          </Pressable>
        </>
      )}

      <Pressable style={styles.backLink} onPress={onBack}>
        <Text style={styles.backLinkText}>Back to login</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1020', padding: 24, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: '#e8edff', marginBottom: 4 },
  subtitle: { fontSize: 15, color: '#9aa7c7', marginBottom: 24 },
  input: {
    backgroundColor: '#131a2e', borderColor: '#243049', borderWidth: 1,
    borderRadius: 10, padding: 14, color: '#e8edff', marginBottom: 12, fontSize: 16,
  },
  button: { backgroundColor: '#14b8a6', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 16 },
  buttonText: { color: '#06231f', fontWeight: '700', fontSize: 16 },
  infoBox: { backgroundColor: 'rgba(13,148,136,0.1)', borderColor: 'rgba(13,148,136,0.3)', borderWidth: 1, borderRadius: 10, padding: 16, marginBottom: 16 },
  infoText: { color: '#5eead4', fontSize: 14, lineHeight: 20 },
  warningBox: { backgroundColor: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.3)', borderWidth: 1, borderRadius: 10, padding: 16, marginBottom: 16 },
  warningText: { color: '#fcd34d', fontSize: 13, lineHeight: 18 },
  backLink: { alignSelf: 'center', marginTop: 16 },
  backLinkText: { color: '#14b8a6', fontSize: 15, fontWeight: '500' },
});

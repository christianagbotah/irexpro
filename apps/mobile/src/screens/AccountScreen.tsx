import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/context/auth-context';

export default function AccountScreen() {
  const { user, error, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Account</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Profile</Text>
        <Text style={styles.muted}>Email: {user?.email ?? '—'}</Text>
        <Text style={styles.muted}>Status: {user?.status ?? '—'}</Text>
        <Text style={styles.muted}>Country: {user?.countryCode ?? '—'}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Security</Text>
        <Text style={styles.muted}>
          Logging out revokes the active server-side session generation before secure local
          credentials are removed.
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
      <View style={styles.card}>
        <Pressable
          accessibilityRole="button"
          style={[styles.button, loggingOut && styles.buttonDisabled]}
          onPress={() => void handleLogout()}
          disabled={loggingOut}
        >
          <Text style={styles.buttonText}>{loggingOut ? 'Revoking session…' : 'Log out'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1020', padding: 20 },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#e8edff',
    marginTop: 12,
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#131a2e',
    borderColor: '#243049',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#e8edff', marginBottom: 6 },
  muted: { color: '#9aa7c7', fontSize: 14, lineHeight: 20 },
  error: { color: '#fed7aa', fontSize: 13, lineHeight: 19, marginTop: 10 },
  button: {
    backgroundColor: '#f59e0b',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.65 },
  buttonText: { color: '#1a1205', fontWeight: '700', fontSize: 16 },
});

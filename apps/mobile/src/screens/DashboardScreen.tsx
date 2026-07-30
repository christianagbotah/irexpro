import { StyleSheet, Text, View } from 'react-native';
import type { AuthUser } from '@irexpro/types';

export default function DashboardScreen({ user }: { user: AuthUser | null }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dashboard</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Welcome back</Text>
        <Text style={styles.muted}>
          {user ? user.email : 'Not signed in'}
        </Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Trading</Text>
        <Text style={styles.muted}>
          Broker connection, AI trading sessions, and open positions will appear
          here. Live trading is not enabled in this foundation.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1020', padding: 20 },
  title: { fontSize: 24, fontWeight: '700', color: '#e8edff', marginTop: 12, marginBottom: 12 },
  card: { backgroundColor: '#131a2e', borderColor: '#243049', borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#e8edff', marginBottom: 6 },
  muted: { color: '#9aa7c7', fontSize: 14, lineHeight: 20 },
});

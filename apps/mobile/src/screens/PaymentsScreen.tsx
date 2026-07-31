import { StyleSheet, Text, View } from 'react-native';

export default function PaymentsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Payments</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Subscription</Text>
        <Text style={styles.muted}>
          View your current subscription and available plans. Checkout is
          initiated through the backend; payment truth comes only from verified
          provider webhooks.
        </Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Payment history</Text>
        <Text style={styles.muted}>Invoices and transaction history.</Text>
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

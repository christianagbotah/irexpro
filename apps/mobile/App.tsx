import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthProvider, useAuth } from '@/context/auth-context';
import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import AccountScreen from './src/screens/AccountScreen';
import PaymentsScreen from './src/screens/PaymentsScreen';

/**
 * iRexPro mobile app entry (Expo + React Native + TypeScript).
 *
 * Auth flow:
 *   LoginScreen → api.login(email, password) → { accessToken, refreshToken }
 *   → api.me(accessToken) → AuthUser → store in context → show Dashboard tab.
 *
 * Token storage: this foundation holds tokens in React state (in-memory). For
 * production, tokens should be persisted in the platform secure storage:
 *   - iOS: Keychain (via expo-secure-store)
 *   - Android: Keystore (via expo-secure-store)
 * Adding `expo-secure-store` is a documented next step. The app never stores
 * tokens in AsyncStorage (that is the mobile equivalent of localStorage and
 * is prohibited by the iRexPro security architecture).
 *
 * The app talks to the public API only (EXPO_PUBLIC_API_BASE_URL). It never
 * calls the AI engine (internal-only) and never stores backend secrets.
 */

type Tab = 'dashboard' | 'account' | 'payments';

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

function AppShell() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');

  if (loading && !user) {
    return (
      <View style={styles.shell}>
        <View style={styles.loading}>
          <Text style={styles.loadingText}>Restoring session…</Text>
        </View>
      </View>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <View style={styles.shell}>
      <View style={styles.content}>
        {tab === 'dashboard' && <DashboardScreen />}
        {tab === 'account' && <AccountScreen />}
        {tab === 'payments' && <PaymentsScreen />}
      </View>
      <View style={styles.tabBar}>
        <TabButton label="Dashboard" active={tab === 'dashboard'} onPress={() => setTab('dashboard')} />
        <TabButton label="Payments" active={tab === 'payments'} onPress={() => setTab('payments')} />
        <TabButton label="Account" active={tab === 'account'} onPress={() => setTab('account')} />
      </View>
    </View>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]}>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#0b1020' },
  content: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#9aa7c7', fontSize: 16 },
  tabBar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#243049', paddingBottom: 16 },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabActive: { borderTopWidth: 2, borderTopColor: '#14b8a6' },
  tabLabel: { color: '#6b7494', fontSize: 13 },
  tabLabelActive: { color: '#14b8a6', fontWeight: '700' },
});

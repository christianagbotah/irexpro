import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AuthUser } from '@irexpro/types';
import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import AccountScreen from './src/screens/AccountScreen';
import PaymentsScreen from './src/screens/PaymentsScreen';

type Tab = 'dashboard' | 'account' | 'payments';

/**
 * iRexPro mobile app entry (Expo + React Native + TypeScript).
 *
 * Foundation only — placeholder screens wired with a simple tab switcher.
 * Live trading and broker execution are intentionally NOT implemented here.
 *
 * The app talks to the public API only (EXPO_PUBLIC_API_BASE_URL). It never
 * calls the AI engine (internal-only) and never stores backend secrets.
 */
export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tab, setTab] = useState<Tab>('dashboard');

  if (!user) {
    return (
      <LoginScreen
        onLoggedIn={() =>
          setUser({ id: 'demo', email: 'trader@example.com', roles: ['USER'], countryCode: 'GH' })
        }
      />
    );
  }

  return (
    <View style={styles.shell}>
      <View style={styles.content}>
        {tab === 'dashboard' && <DashboardScreen user={user} />}
        {tab === 'account' && <AccountScreen user={user} />}
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
  tabBar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#243049', paddingBottom: 16 },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabActive: { borderTopWidth: 2, borderTopColor: '#14b8a6' },
  tabLabel: { color: '#6b7494', fontSize: 13 },
  tabLabelActive: { color: '#14b8a6', fontWeight: '700' },
});

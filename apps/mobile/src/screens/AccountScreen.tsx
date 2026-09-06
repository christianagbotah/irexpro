import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { MfaSetupResponse } from '@irexpro/types';
import { useAuth } from '@/context/auth-context';
import { api } from '@/lib/api';
import {
  accountSecurityError,
  beginMfaSetup,
  isSixDigitCode,
  isValidCountryCode,
  normalizeCountryCode,
} from '@/lib/account-security';

type BusyAction =
  | 'profile'
  | 'email-request'
  | 'phone-request'
  | 'phone-confirm'
  | 'mfa-setup'
  | 'mfa-enable'
  | 'mfa-disable'
  | 'logout'
  | null;

export default function AccountScreen() {
  const {
    user,
    accessToken,
    error: authError,
    setSession,
    clearSession,
    logout,
  } = useAuth();

  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [countryCode, setCountryCode] = useState(user?.countryCode ?? '');
  const [phoneCode, setPhoneCode] = useState('');
  const [mfaPassword, setMfaPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaSetup, setMfaSetup] = useState<MfaSetupResponse | null>(null);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setFirstName(user?.firstName ?? '');
    setLastName(user?.lastName ?? '');
    setCountryCode(user?.countryCode ?? '');
  }, [user?.firstName, user?.lastName, user?.countryCode]);

  function startAction(action: Exclude<BusyAction, null>): boolean {
    if (busy) return false;
    setBusy(action);
    setNotice(null);
    setActionError(null);
    return true;
  }

  function finishAction() {
    setBusy(null);
  }

  async function refreshIdentity(): Promise<void> {
    if (!accessToken) {
      throw new Error('Authenticated access token is unavailable');
    }
    const refreshed = await api.me();
    setSession(refreshed, accessToken);
  }

  async function handleSaveProfile() {
    if (!startAction('profile')) return;
    try {
      const normalizedCountry = normalizeCountryCode(countryCode);
      if (normalizedCountry && !isValidCountryCode(normalizedCountry)) {
        setActionError('Country code must be a two-letter ISO code, for example GH.');
        return;
      }

      await api.updateMyProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        ...(normalizedCountry ? { countryCode: normalizedCountry } : {}),
      });
      await refreshIdentity();
      setNotice('Profile updated successfully.');
    } catch (error) {
      setActionError(accountSecurityError(error));
    } finally {
      finishAction();
    }
  }

  async function handleEmailVerificationRequest() {
    if (!startAction('email-request')) return;
    try {
      const response = await api.requestEmailVerification();
      setNotice(response.message);
    } catch (error) {
      setActionError(accountSecurityError(error));
    } finally {
      finishAction();
    }
  }

  async function handlePhoneVerificationRequest() {
    if (!startAction('phone-request')) return;
    try {
      const response = await api.requestPhoneVerification();
      setNotice(response.message);
    } catch (error) {
      setActionError(accountSecurityError(error));
    } finally {
      finishAction();
    }
  }

  async function handlePhoneVerificationConfirm() {
    if (!startAction('phone-confirm')) return;
    try {
      if (!isSixDigitCode(phoneCode)) {
        setActionError('Enter the six-digit verification code.');
        return;
      }
      const response = await api.confirmPhoneVerification(phoneCode.trim());
      setPhoneCode('');
      await refreshIdentity();
      setNotice(response.message);
    } catch (error) {
      setActionError(accountSecurityError(error));
    } finally {
      finishAction();
    }
  }

  async function handleBeginMfaSetup() {
    if (!startAction('mfa-setup')) return;
    try {
      if (!mfaPassword) {
        setActionError('Enter your current password to begin MFA setup.');
        return;
      }
      const setup = await beginMfaSetup(mfaPassword);
      // Enrollment material remains component-memory-only. Never persist or log it.
      setMfaSetup(setup);
      setMfaPassword('');
      setMfaCode('');
      setNotice('MFA enrollment started. Add the account to your authenticator, then verify a code.');
    } catch (error) {
      setActionError(accountSecurityError(error));
    } finally {
      finishAction();
    }
  }

  async function handleEnableMfa() {
    if (!startAction('mfa-enable')) return;
    try {
      if (!mfaSetup) {
        setActionError('Begin MFA setup before verifying an authenticator code.');
        return;
      }
      if (!isSixDigitCode(mfaCode)) {
        setActionError('Enter the six-digit code from your authenticator app.');
        return;
      }

      await api.enableMfa(mfaCode.trim());
      // The backend revokes every existing session when MFA is enabled.
      // Clear the local token pair immediately rather than leave stale credentials active.
      setMfaSetup(null);
      setMfaCode('');
      await clearSession();
    } catch (error) {
      setActionError(accountSecurityError(error));
    } finally {
      finishAction();
    }
  }

  async function handleDisableMfa() {
    if (!startAction('mfa-disable')) return;
    try {
      if (!mfaPassword) {
        setActionError('Enter your current password to disable MFA.');
        return;
      }
      if (!isSixDigitCode(mfaCode)) {
        setActionError('Enter the six-digit code from your authenticator app.');
        return;
      }

      await api.disableMfa(mfaCode.trim(), mfaPassword);
      setMfaPassword('');
      setMfaCode('');
      // Disabling MFA also revokes all existing sessions server-side.
      await clearSession();
    } catch (error) {
      setActionError(accountSecurityError(error));
    } finally {
      finishAction();
    }
  }

  async function handleLogout() {
    if (!startAction('logout')) return;
    try {
      await logout();
    } finally {
      finishAction();
    }
  }

  const emailVerified = user?.emailVerified === true;
  const phoneVerified = user?.phoneVerified === true;
  const mfaEnabled = user?.mfaEnabled === true;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      accessibilityLabel="Account and security settings"
    >
      <Text style={styles.title}>Account & Security</Text>
      <Text style={styles.subtitle}>
        Keep your profile and sign-in protections current. Sensitive security material stays on this screen only while you use it.
      </Text>

      {(actionError || authError) ? (
        <View style={styles.errorBanner} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          <Text style={styles.errorText}>{actionError ?? authError}</Text>
        </View>
      ) : null}

      {notice ? (
        <View style={styles.successBanner} accessibilityLiveRegion="polite">
          <Text style={styles.successText}>{notice}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeadingCopy}>
            <Text style={styles.cardTitle}>Profile</Text>
            <Text style={styles.muted}>Authenticated account details</Text>
          </View>
          <StatusPill label={user?.status ?? 'Unknown'} positive={user?.status === 'ACTIVE'} />
        </View>

        <LabeledInput
          label="First name"
          value={firstName}
          onChangeText={setFirstName}
          autoCapitalize="words"
          maxLength={100}
          editable={!busy}
        />
        <LabeledInput
          label="Last name"
          value={lastName}
          onChangeText={setLastName}
          autoCapitalize="words"
          maxLength={100}
          editable={!busy}
        />
        <LabeledInput
          label="Country code"
          value={countryCode}
          onChangeText={(value) => setCountryCode(value.toUpperCase())}
          autoCapitalize="characters"
          maxLength={2}
          placeholder="GH"
          editable={!busy}
        />
        <Text style={styles.helper}>Use the two-letter ISO country code, such as GH.</Text>

        <ActionButton
          label={busy === 'profile' ? 'Saving profile…' : 'Save profile'}
          onPress={() => void handleSaveProfile()}
          disabled={Boolean(busy)}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Contact verification</Text>
        <Text style={styles.muted}>
          Verification status is loaded from your authenticated identity and is never inferred on the device.
        </Text>

        <View style={styles.verificationRow}>
          <View style={styles.verificationCopy}>
            <Text style={styles.rowTitle}>Email</Text>
            <Text style={styles.valueText}>{user?.email ?? 'No email on account'}</Text>
          </View>
          <StatusPill label={emailVerified ? 'Verified' : 'Unverified'} positive={emailVerified} />
        </View>
        {!emailVerified && user?.email ? (
          <ActionButton
            label={busy === 'email-request' ? 'Sending…' : 'Send verification email'}
            onPress={() => void handleEmailVerificationRequest()}
            disabled={Boolean(busy)}
            secondary
          />
        ) : null}

        <View style={styles.divider} />

        <View style={styles.verificationRow}>
          <View style={styles.verificationCopy}>
            <Text style={styles.rowTitle}>Phone</Text>
            <Text style={styles.valueText}>{user?.phone ?? 'No phone on account'}</Text>
          </View>
          <StatusPill label={phoneVerified ? 'Verified' : 'Unverified'} positive={phoneVerified} />
        </View>
        {!phoneVerified && user?.phone ? (
          <>
            <ActionButton
              label={busy === 'phone-request' ? 'Sending…' : 'Send verification code'}
              onPress={() => void handlePhoneVerificationRequest()}
              disabled={Boolean(busy)}
              secondary
            />
            <LabeledInput
              label="Verification code"
              value={phoneCode}
              onChangeText={setPhoneCode}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="123456"
              editable={!busy}
            />
            <ActionButton
              label={busy === 'phone-confirm' ? 'Verifying…' : 'Verify phone'}
              onPress={() => void handlePhoneVerificationConfirm()}
              disabled={Boolean(busy) || !isSixDigitCode(phoneCode)}
            />
          </>
        ) : null}
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeadingCopy}>
            <Text style={styles.cardTitle}>Authenticator MFA</Text>
            <Text style={styles.muted}>Time-based one-time password protection</Text>
          </View>
          <StatusPill label={mfaEnabled ? 'Enabled' : 'Disabled'} positive={mfaEnabled} />
        </View>

        {!mfaEnabled ? (
          <>
            {!mfaSetup ? (
              <>
                <Text style={styles.bodyText}>
                  Re-enter your current password before the server issues one-time enrollment material.
                </Text>
                <LabeledInput
                  label="Current password"
                  value={mfaPassword}
                  onChangeText={setMfaPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={128}
                  editable={!busy}
                />
                <ActionButton
                  label={busy === 'mfa-setup' ? 'Starting setup…' : 'Begin MFA setup'}
                  onPress={() => void handleBeginMfaSetup()}
                  disabled={Boolean(busy) || !mfaPassword}
                />
              </>
            ) : (
              <>
                <View style={styles.secretPanel} accessibilityRole="summary">
                  <Text style={styles.secretTitle}>One-time enrollment material</Text>
                  <Text style={styles.secretWarning}>
                    Add this account to your authenticator now. This secret is not saved by the app and disappears when you leave or cancel setup.
                  </Text>
                  <Text style={styles.secretLabel}>Secret</Text>
                  <Text selectable style={styles.secretValue}>{mfaSetup.secret}</Text>
                  <Text style={styles.secretLabel}>Authenticator URI</Text>
                  <Text selectable style={styles.uriValue}>{mfaSetup.otpauthUri}</Text>
                </View>

                <LabeledInput
                  label="Authenticator code"
                  value={mfaCode}
                  onChangeText={setMfaCode}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="123456"
                  editable={!busy}
                />
                <ActionButton
                  label={busy === 'mfa-enable' ? 'Enabling MFA…' : 'Verify and enable MFA'}
                  onPress={() => void handleEnableMfa()}
                  disabled={Boolean(busy) || !isSixDigitCode(mfaCode)}
                />
                <ActionButton
                  label="Cancel setup and clear secret"
                  onPress={() => {
                    setMfaSetup(null);
                    setMfaCode('');
                    setNotice(null);
                    setActionError(null);
                  }}
                  disabled={Boolean(busy)}
                  secondary
                />
              </>
            )}
          </>
        ) : (
          <>
            <Text style={styles.bodyText}>
              Disabling MFA requires both your current password and a valid authenticator code. The server revokes existing sessions after the change.
            </Text>
            <LabeledInput
              label="Current password"
              value={mfaPassword}
              onChangeText={setMfaPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={128}
              editable={!busy}
            />
            <LabeledInput
              label="Authenticator code"
              value={mfaCode}
              onChangeText={setMfaCode}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="123456"
              editable={!busy}
            />
            <ActionButton
              label={busy === 'mfa-disable' ? 'Disabling MFA…' : 'Disable MFA'}
              onPress={() => void handleDisableMfa()}
              disabled={Boolean(busy) || !mfaPassword || !isSixDigitCode(mfaCode)}
              danger
            />
          </>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Session security</Text>
        <Text style={styles.bodyText}>
          Logging out revokes the active server-side session generation before secure local credentials are removed. If the server cannot confirm revocation during a temporary outage, the app keeps the credentials so logout can be retried safely.
        </Text>
        <ActionButton
          label={busy === 'logout' ? 'Revoking session…' : 'Log out'}
          onPress={() => void handleLogout()}
          disabled={Boolean(busy)}
          danger
        />
      </View>
    </ScrollView>
  );
}

function StatusPill({ label, positive }: { label: string; positive: boolean }) {
  return (
    <View
      style={[styles.pill, positive ? styles.pillPositive : styles.pillNeutral]}
      accessibilityLabel={`${label} status`}
    >
      <Text style={[styles.pillText, positive ? styles.pillTextPositive : styles.pillTextNeutral]}>
        {label.replaceAll('_', ' ')}
      </Text>
    </View>
  );
}

function LabeledInput({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#65708d"
        style={styles.input}
        {...props}
      />
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  disabled,
  secondary = false,
  danger = false,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  secondary?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[
        styles.button,
        secondary && styles.buttonSecondary,
        danger && styles.buttonDanger,
        disabled && styles.buttonDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text
        style={[
          styles.buttonText,
          secondary && styles.buttonTextSecondary,
          danger && styles.buttonTextDanger,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1020' },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '800', color: '#e8edff', marginTop: 8 },
  subtitle: { color: '#9aa7c7', fontSize: 14, lineHeight: 21, marginTop: 6, marginBottom: 16 },
  card: {
    backgroundColor: '#131a2e',
    borderColor: '#243049',
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  sectionHeadingCopy: { flex: 1 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#e8edff', marginBottom: 5 },
  muted: { color: '#9aa7c7', fontSize: 13, lineHeight: 19 },
  bodyText: { color: '#b9c3dd', fontSize: 14, lineHeight: 21, marginTop: 6, marginBottom: 12 },
  field: { marginTop: 13 },
  fieldLabel: { color: '#cbd5e1', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: '#33415f',
    backgroundColor: '#0d1426',
    color: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  helper: { color: '#74809e', fontSize: 12, lineHeight: 18, marginTop: 6 },
  button: {
    minHeight: 46,
    backgroundColor: '#14b8a6',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 13,
  },
  buttonSecondary: { backgroundColor: '#18233b', borderWidth: 1, borderColor: '#33415f' },
  buttonDanger: { backgroundColor: '#3b171c', borderWidth: 1, borderColor: '#7f1d1d' },
  buttonDisabled: { opacity: 0.52 },
  buttonText: { color: '#041713', fontWeight: '800', fontSize: 14 },
  buttonTextSecondary: { color: '#cbd5e1' },
  buttonTextDanger: { color: '#fecaca' },
  errorBanner: {
    borderWidth: 1,
    borderColor: '#7c2d12',
    backgroundColor: '#2a1714',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  errorText: { color: '#fed7aa', fontSize: 13, lineHeight: 19 },
  successBanner: {
    borderWidth: 1,
    borderColor: '#115e59',
    backgroundColor: '#0d2928',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  successText: { color: '#99f6e4', fontSize: 13, lineHeight: 19 },
  verificationRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 15 },
  verificationCopy: { flex: 1 },
  rowTitle: { color: '#e8edff', fontSize: 14, fontWeight: '700', marginBottom: 3 },
  valueText: { color: '#9aa7c7', fontSize: 13 },
  divider: { height: 1, backgroundColor: '#243049', marginTop: 16 },
  pill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1 },
  pillPositive: { backgroundColor: '#0d2928', borderColor: '#115e59' },
  pillNeutral: { backgroundColor: '#26202d', borderColor: '#51405e' },
  pillText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  pillTextPositive: { color: '#5eead4' },
  pillTextNeutral: { color: '#c4b5fd' },
  secretPanel: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#854d0e',
    backgroundColor: '#291f0b',
    borderRadius: 10,
    padding: 12,
  },
  secretTitle: { color: '#fde68a', fontSize: 14, fontWeight: '800', marginBottom: 5 },
  secretWarning: { color: '#fcd34d', fontSize: 12, lineHeight: 18, marginBottom: 10 },
  secretLabel: { color: '#d6c48b', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginTop: 6 },
  secretValue: { color: '#fff7d6', fontSize: 14, lineHeight: 21, marginTop: 3 },
  uriValue: { color: '#fff7d6', fontSize: 11, lineHeight: 17, marginTop: 3 },
});

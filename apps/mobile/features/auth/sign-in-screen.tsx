import { GoogleSigninButton } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { Button, Label, Screen } from '@/components/housegains/ui';
import { isDarkColor, useAppearance } from '@/features/appearance';
import { useHouseGainsTranslation } from '@/localization/housegains';
import { authErrorKey } from './auth-errors';
import { useAuth } from './auth-provider';
import { legalUrl } from './legal';
import { googleWebClientId } from './providers';

type Mode = 'signIn' | 'create' | 'reset';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;
const ERROR_COLOR = '#B4233B';

/** Sign in with Apple (iOS), Google (when provisioned), or email. Shown whenever no user is signed in. */
export function SignInScreen() {
  const { tokens } = useAppearance();
  const darkCanvas = isDarkColor(tokens.canvas);
  const { t, locale } = useHouseGainsTranslation();
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>('signIn');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [messageKey, setMessageKey] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const googleEnabled = googleWebClientId() !== '';
  const appleEnabled = Platform.OS === 'ios';

  const switchMode = (next: Mode) => {
    setMode(next);
    setMessageKey(null);
    setResetSent(false);
  };

  /** Runs one sign-in step. A cancelled sign-in maps to no message at all. */
  const run = async (operation: () => Promise<void>, problemKey?: string | null) => {
    if (problemKey) {
      setMessageKey(problemKey);
      return;
    }
    setBusy(true);
    setMessageKey(null);
    try {
      await operation();
    } catch (error) {
      setMessageKey(authErrorKey(error));
    } finally {
      setBusy(false);
    }
  };

  const emailProblem = EMAIL_PATTERN.test(email.trim()) ? null : 'housegains.auth.validation.email';
  const submit = () => {
    if (mode === 'reset') {
      void run(async () => {
        await auth.sendPasswordReset(email);
        setResetSent(true);
      }, emailProblem);
    } else if (mode === 'create') {
      const problem = !name.trim()
        ? 'housegains.auth.validation.name'
        : (emailProblem ??
          (password.length < MIN_PASSWORD_LENGTH ? 'housegains.auth.validation.password' : null));
      void run(() => auth.createAccountWithEmail(name, email, password), problem);
    } else {
      const problem = emailProblem ?? (password ? null : 'housegains.auth.validation.password');
      void run(() => auth.signInWithEmail(email, password), problem);
    }
  };

  const title =
    mode === 'create'
      ? t('housegains.auth.create.title')
      : mode === 'reset'
        ? t('housegains.auth.reset.title')
        : t('housegains.auth.signIn.title');
  const subtitle =
    mode === 'create'
      ? t('housegains.auth.create.subtitle')
      : mode === 'reset'
        ? t('housegains.auth.reset.subtitle')
        : t('housegains.auth.signIn.subtitle');
  const submitTitle =
    mode === 'create'
      ? t('housegains.auth.create.submit')
      : mode === 'reset'
        ? t('housegains.auth.reset.submit')
        : t('housegains.auth.signIn.submit');
  const showSocial = mode !== 'reset' && (appleEnabled || googleEnabled);
  const openLegal = (page: 'terms' | 'privacy') =>
    void Linking.openURL(legalUrl(locale, page)).catch(() => undefined);

  return (
    <Screen
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={styles.content}
      testID="housegains.auth.signIn"
    >
      <View style={styles.stack}>
        <View style={styles.header}>
          <Label accessibilityRole="header" testID="housegains.auth.title" variant="title">
            {title}
          </Label>
          <Label variant="body" style={{ color: tokens.muted }}>
            {subtitle}
          </Label>
        </View>

        {showSocial ? (
          <View style={styles.stack}>
            {appleEnabled ? (
              <AppleAuthentication.AppleAuthenticationButton
                buttonStyle={
                  darkCanvas
                    ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                    : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                }
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                cornerRadius={tokens.radius}
                onPress={() => void run(auth.signInWithApple)}
                style={styles.social}
                testID="housegains.auth.apple"
              />
            ) : null}
            {googleEnabled ? (
              <GoogleSigninButton
                color={darkCanvas ? 'light' : 'dark'}
                disabled={busy}
                onPress={() => void run(auth.signInWithGoogle)}
                style={styles.social}
                testID="housegains.auth.google"
              />
            ) : null}
            <View style={styles.divider}>
              <View style={[styles.rule, { backgroundColor: tokens.border }]} />
              <Label variant="caption">{t('housegains.auth.or')}</Label>
              <View style={[styles.rule, { backgroundColor: tokens.border }]} />
            </View>
          </View>
        ) : null}

        <View style={styles.stack}>
          {mode === 'create' ? (
            <Field
              accessibilityLabel={t('housegains.auth.name.label')}
              autoComplete="name"
              label={t('housegains.auth.name.label')}
              onChangeText={setName}
              returnKeyType="next"
              testID="housegains.auth.name"
              textContentType="name"
              value={name}
            />
          ) : null}
          <Field
            accessibilityLabel={t('housegains.auth.email.label')}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            label={t('housegains.auth.email.label')}
            onChangeText={setEmail}
            returnKeyType={mode === 'reset' ? 'go' : 'next'}
            onSubmitEditing={mode === 'reset' ? submit : undefined}
            testID="housegains.auth.email"
            textContentType="emailAddress"
            value={email}
          />
          {mode !== 'reset' ? (
            <Field
              accessibilityLabel={t('housegains.auth.password.label')}
              autoComplete={mode === 'create' ? 'new-password' : 'password'}
              label={t('housegains.auth.password.label')}
              onChangeText={setPassword}
              onSubmitEditing={submit}
              returnKeyType="go"
              secureTextEntry
              testID="housegains.auth.password"
              textContentType={mode === 'create' ? 'newPassword' : 'password'}
              value={password}
            />
          ) : null}

          <Button
            disabled={busy}
            onPress={submit}
            testID="housegains.auth.submit"
            title={submitTitle}
          />
          {busy ? <ActivityIndicator color={tokens.primary} /> : null}
        </View>

        {messageKey ? (
          <Label
            accessibilityRole="alert"
            style={{ color: ERROR_COLOR }}
            testID="housegains.auth.message"
          >
            {t(messageKey)}
          </Label>
        ) : null}
        {resetSent ? (
          <Label accessibilityLiveRegion="polite" testID="housegains.auth.resetSent">
            {t('housegains.auth.reset.sent')}
          </Label>
        ) : null}

        <View style={styles.links}>
          {mode === 'signIn' ? (
            <>
              <TextLink
                label={t('housegains.auth.signIn.forgot')}
                onPress={() => switchMode('reset')}
                testID="housegains.auth.forgot"
              />
              <TextLink
                label={t('housegains.auth.signIn.create')}
                onPress={() => switchMode('create')}
                testID="housegains.auth.create"
              />
            </>
          ) : (
            <TextLink
              label={
                mode === 'create'
                  ? t('housegains.auth.create.haveAccount')
                  : t('housegains.auth.reset.back')
              }
              onPress={() => switchMode('signIn')}
              testID="housegains.auth.back"
            />
          )}
        </View>

        <Label variant="caption" style={styles.legal}>
          {t('housegains.auth.legal.agree')}{' '}
          <Text
            accessibilityRole="link"
            onPress={() => openLegal('terms')}
            style={{ color: tokens.primary, textDecorationLine: 'underline' }}
            testID="housegains.auth.legal.terms"
          >
            {t('housegains.auth.legal.terms')}
          </Text>{' '}
          {t('housegains.auth.legal.and')}{' '}
          <Text
            accessibilityRole="link"
            onPress={() => openLegal('privacy')}
            style={{ color: tokens.primary, textDecorationLine: 'underline' }}
            testID="housegains.auth.legal.privacy"
          >
            {t('housegains.auth.legal.privacy')}
          </Text>
          {t('housegains.auth.legal.end')}
        </Label>
      </View>
    </Screen>
  );
}

function Field({ label, ...input }: TextInputProps & { label: string }) {
  const { tokens } = useAppearance();
  return (
    <View style={styles.field}>
      <Label variant="caption" style={{ color: tokens.text }}>
        {label}
      </Label>
      <TextInput
        autoCorrect={false}
        placeholderTextColor={tokens.muted}
        {...input}
        style={[
          styles.input,
          {
            backgroundColor: tokens.surface,
            borderColor: tokens.border,
            borderRadius: tokens.radius,
            color: tokens.text,
            fontFamily: tokens.typography.body,
          },
        ]}
      />
    </View>
  );
}

function TextLink({ label, onPress, testID }: { label: string; onPress(): void; testID: string }) {
  const { tokens } = useAppearance();
  return (
    <Pressable
      accessibilityRole="link"
      hitSlop={8}
      onPress={onPress}
      style={styles.link}
      testID={testID}
    >
      <Label variant="body" style={{ color: tokens.primary, fontFamily: tokens.typography.medium }}>
        {label}
      </Label>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', gap: 22, padding: 24 },
  stack: { gap: 14 },
  header: { gap: 6 },
  social: { height: 50, width: '100%' },
  divider: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth * 2 },
  field: { gap: 6 },
  input: { borderWidth: 1, fontSize: 16, minHeight: 48, paddingHorizontal: 14 },
  links: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  link: { minHeight: 44, justifyContent: 'center' },
  legal: { textAlign: 'center' },
});

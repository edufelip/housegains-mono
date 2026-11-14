import auth from '@react-native-firebase/auth';
import Constants from 'expo-constants';
import { useState } from 'react';
import { Linking, Switch, View } from 'react-native';
import { Button, Card, Label, Screen } from '@/components/housegains/ui';
import { deleteAccount, signOut } from '@/features/account/account-api';
import { accountErrorKey, legalUrl, type LegalKind } from '@/features/account/account-rules';
import { useAppearance } from '@/features/appearance';
import {
  disableReminders,
  enableReminders,
  useReminderPreference,
} from '@/features/notifications/reminders';
import { useHouseGainsTranslation } from '@/localization/housegains';
import { ScreenTitle } from './screen-elements';

type ExtraConfig = {
  supportUrl?: string;
  terms?: { url?: string; privacyPolicyUrl?: string };
};

function errorText(t: (key: string) => string, error: unknown): string {
  return t(accountErrorKey(error));
}

/** Name, email, sign out and the entry to account deletion. */
export function AccountSection({ onDeleteAccount }: { onDeleteAccount(): void }) {
  const { tokens } = useAppearance();
  const { t } = useHouseGainsTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const user = auth().currentUser;

  const logOut = async () => {
    setBusy(true);
    setError(null);
    try {
      await signOut();
    } catch (cause) {
      setError(errorText(t, cause));
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: 10 }} testID="housegains.settings.account">
      <Label variant="heading">{t('housegains.account.section.account')}</Label>
      <Label variant="caption">{t('housegains.account.name')}</Label>
      <Label>{user?.displayName ?? '—'}</Label>
      <Label variant="caption">{t('housegains.account.email')}</Label>
      <Label>{user?.email ?? t('housegains.account.noEmail')}</Label>
      {error ? <Label style={{ color: tokens.danger }}>{error}</Label> : null}
      <Button
        disabled={busy}
        onPress={() => void logOut()}
        testID="housegains.settings.signOut"
        title={t('housegains.account.signOut')}
        variant="secondary"
      />
      <Button
        disabled={busy}
        onPress={onDeleteAccount}
        testID="housegains.settings.deleteAccount"
        title={t('housegains.account.deleteAccount')}
        variant="outline"
      />
    </Card>
  );
}

/** Confirmation screen for account deletion. Success returns to sign-in through the auth state. */
export function DeleteAccountScreen({ onCancel }: { onCancel(): void }) {
  const { tokens } = useAppearance();
  const { t } = useHouseGainsTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
    } catch (cause) {
      setError(errorText(t, cause));
      setBusy(false);
    }
  };

  return (
    <Screen
      contentContainerStyle={{ flexGrow: 1, gap: 14, padding: 18 }}
      testID="housegains.deleteAccount"
    >
      <ScreenTitle
        title={t('housegains.account.delete.title')}
        description={t('housegains.account.delete.body')}
      />
      <Card style={{ gap: 8 }}>
        <Label variant="heading">{t('housegains.account.delete.removedTitle')}</Label>
        <Label>{t('housegains.account.delete.removed')}</Label>
      </Card>
      <Card style={{ gap: 8 }}>
        <Label variant="heading">{t('housegains.account.delete.keptTitle')}</Label>
        <Label>{t('housegains.account.delete.kept')}</Label>
      </Card>
      {error ? (
        <Card style={{ borderColor: tokens.danger }} testID="housegains.deleteAccount.error">
          <Label style={{ color: tokens.danger }}>{error}</Label>
        </Card>
      ) : null}
      <View style={{ gap: 10, marginTop: 'auto' }}>
        <Button
          disabled={busy}
          onPress={() => void confirm()}
          testID="housegains.deleteAccount.confirm"
          style={{ backgroundColor: tokens.danger, borderColor: tokens.danger }}
          title={
            busy ? t('housegains.account.delete.busy') : t('housegains.account.delete.confirm')
          }
        />
        <Button
          disabled={busy}
          onPress={onCancel}
          testID="housegains.deleteAccount.cancel"
          title={t('housegains.account.delete.keep')}
          variant="ghost"
        />
      </View>
    </Screen>
  );
}

/** Chore reminders switch. Turning on asks for notification permission first. */
export function ReminderSection() {
  const { tokens } = useAppearance();
  const { t } = useHouseGainsTranslation();
  const preference = useReminderPreference();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const change = async (next: boolean) => {
    setBusy(true);
    setMessage(null);
    try {
      if (next) {
        const granted = await enableReminders();
        if (!granted) setMessage(t('housegains.account.reminders.denied'));
      } else {
        await disableReminders();
      }
    } catch (cause) {
      setMessage(errorText(t, cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: 10 }}>
      <Label variant="heading">{t('housegains.account.section.reminders')}</Label>
      <Label variant="caption">{t('housegains.account.reminders.description')}</Label>
      <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}>
        <Label style={{ fontWeight: '700' }}>{t('housegains.account.reminders.toggle')}</Label>
        <Switch
          accessibilityLabel={t('housegains.account.reminders.toggle')}
          disabled={busy || !preference.ready}
          onValueChange={(value) => void change(value)}
          testID="housegains.settings.reminders"
          thumbColor={tokens.onPrimary}
          trackColor={{ false: tokens.border, true: tokens.primary }}
          value={preference.enabled}
        />
      </View>
      {message ? <Label style={{ color: tokens.danger }}>{message}</Label> : null}
    </Card>
  );
}

/** Privacy, terms, support and the app version. Links open in the browser. */
export function AboutSection() {
  const { tokens } = useAppearance();
  const { t, locale } = useHouseGainsTranslation();
  const [message, setMessage] = useState<string | null>(null);
  const extra = (Constants.expoConfig?.extra ?? {}) as ExtraConfig;
  const links: { key: string; kind: LegalKind; url: string; label: string }[] = [
    {
      key: 'privacy',
      kind: 'privacy',
      url: legalUrl('privacy', locale, extra.terms?.privacyPolicyUrl),
      label: t('housegains.account.about.privacy'),
    },
    {
      key: 'terms',
      kind: 'terms',
      url: legalUrl('terms', locale, extra.terms?.url),
      label: t('housegains.account.about.terms'),
    },
    {
      key: 'support',
      kind: 'support',
      url: legalUrl('support', locale, extra.supportUrl),
      label: t('housegains.account.about.support'),
    },
  ];

  const open = async (url: string) => {
    setMessage(null);
    try {
      await Linking.openURL(url);
    } catch {
      setMessage(t('housegains.account.about.openError'));
    }
  };

  return (
    <Card style={{ gap: 10 }} testID="housegains.settings.about">
      <Label variant="heading">{t('housegains.account.section.about')}</Label>
      {links.map((link) => (
        <Button
          key={link.key}
          onPress={() => void open(link.url)}
          testID={`housegains.settings.about.${link.key}`}
          title={link.label}
          variant="secondary"
        />
      ))}
      <Label variant="caption">
        {t('housegains.account.about.version', {
          version: Constants.expoConfig?.version ?? '—',
        })}
      </Label>
      {message ? <Label style={{ color: tokens.danger }}>{message}</Label> : null}
    </Card>
  );
}

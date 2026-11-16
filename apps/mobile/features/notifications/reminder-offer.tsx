// One-time explanation before the system notification prompt, shown after joining or creating a household.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Modal, View } from 'react-native';
import { Button, Card, Label } from '@/components/housegains/ui';
import { useAppearance } from '@/features/appearance';
import { useHouseGainsTranslation } from '@/localization/housegains';
import { enableReminders } from './reminders';

const PROMPTED_KEY = 'housegains.notifications.prompted.v1';

/**
 * When `requested` turns true, shows the explanation once per install. A storage
 * failure shows nothing, so the system prompt never appears without context.
 */
export function ReminderOffer({ requested, onHandled }: { requested: boolean; onHandled(): void }) {
  const { t } = useHouseGainsTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!requested) return undefined;
    let active = true;
    void (async () => {
      try {
        const prompted = await AsyncStorage.getItem(PROMPTED_KEY);
        if (active && !prompted) {
          await AsyncStorage.setItem(PROMPTED_KEY, '1');
          setVisible(true);
        }
      } catch {
        // Skip the offer when storage is unavailable.
      } finally {
        if (active) onHandled();
      }
    })();
    return () => {
      active = false;
    };
  }, [requested, onHandled]);

  const { tokens } = useAppearance();
  const turnOn = () => {
    setVisible(false);
    void enableReminders().catch(() => false);
  };

  return (
    <Modal
      animationType="fade"
      onRequestClose={() => setVisible(false)}
      transparent
      visible={visible}
    >
      <View
        style={{
          backgroundColor: tokens.scrim,
          flex: 1,
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <Card style={{ gap: 12, padding: 20 }} testID="housegains.reminders.offer">
          <Label variant="heading">{t('housegains.account.reminders.explainTitle')}</Label>
          <Label>{t('housegains.account.reminders.explainBody')}</Label>
          <Button
            onPress={turnOn}
            testID="housegains.reminders.turnOn"
            title={t('housegains.account.reminders.turnOn')}
          />
          <Button
            onPress={() => setVisible(false)}
            testID="housegains.reminders.notNow"
            title={t('housegains.account.reminders.notNow')}
            variant="ghost"
          />
        </Card>
      </View>
    </Modal>
  );
}

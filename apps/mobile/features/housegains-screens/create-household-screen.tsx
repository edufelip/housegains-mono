import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Button, Card, Label, Screen } from '@/components/housegains/ui';
import { useAppearance } from '@/features/appearance';
import { useHouseGainsTranslation } from '@/localization/housegains';
import { ChoiceChip, FormField, HouseGainsGlyph, ScreenTitle } from './screen-elements';
import type { Household } from '@/features/household';

const HOUSE_ICONS = ['🏠', '🏢', '♡', '🐾', '🍃', '☆'] as const;
const HOUSE_COLORS = ['#FFD33D', '#4568FF', '#25DDA3', '#F58BB7', '#FF6845'] as const;

export function CreateHouseholdScreen({
  existingHousehold,
  onCreate,
  onSave,
  onContinue,
  onJoin,
  onCancel,
  onDeleteAccount,
  editMode = false,
  hasError,
}: {
  existingHousehold: Household | null;
  onCreate(name: string, icon: string, color: string): Promise<void>;
  onSave?(name: string, icon: string, color: string): Promise<void>;
  onContinue?(): void;
  onJoin(): void;
  onCancel?(): void;
  /** Shown only without a household, so an account can always be deleted in the app. */
  onDeleteAccount?(): void;
  editMode?: boolean;
  hasError: boolean;
}) {
  const { tokens } = useAppearance();
  const { t } = useHouseGainsTranslation();
  const [name, setName] = useState(existingHousehold?.name ?? '');
  const [icon, setIcon] = useState(existingHousehold?.icon ?? HOUSE_ICONS[0]);
  const [color, setColor] = useState(existingHousehold?.color ?? HOUSE_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const validName = name.trim().length >= 2 && name.trim().length <= 30;
  const isReadOnly = existingHousehold !== null && !editMode;
  const isEditing = existingHousehold !== null && editMode;

  const close = () => {
    if (!onCancel) return;
    if (isEditing || name.trim().length === 0) {
      onCancel();
      return;
    }
    Alert.alert(
      t('housegains.screens.onboarding.discardTitle'),
      t('housegains.screens.onboarding.discardBody'),
      [
        { text: t('housegains.screens.common.cancel'), style: 'cancel' },
        {
          text: t('housegains.screens.onboarding.discardAction'),
          style: 'destructive',
          onPress: onCancel,
        },
      ],
    );
  };

  const submit = async () => {
    if (isReadOnly) {
      onContinue?.();
      return;
    }
    setSaving(true);
    try {
      if (isEditing) await onSave?.(name.trim(), icon, color);
      else await onCreate(name.trim(), icon, color);
    } catch {
      // The route keeps the form in place and displays a localized retry message.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      contentContainerStyle={{ flexGrow: 1, gap: 18, padding: 20 }}
      testID="housegains.onboarding.createHousehold"
    >
      <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}>
        <Pressable
          accessibilityLabel={t('housegains.screens.common.close')}
          accessibilityRole="button"
          onPress={close}
        >
          <Ionicons color={tokens.text} name="close" size={25} />
        </Pressable>
        <Label variant="eyebrow">
          {isEditing
            ? t('housegains.screens.settings.householdProfile')
            : t('housegains.screens.onboarding.stepCount', { step: 1, total: 4 })}
        </Label>
        <View
          accessibilityLabel={t('housegains.screens.onboarding.stepCount', { step: 1, total: 4 })}
          style={{ flexDirection: 'row', gap: 7 }}
        >
          {[0, 1, 2, 3].map((step) => (
            <View
              key={step}
              style={{
                backgroundColor: step === 0 ? tokens.primary : tokens.border,
                borderRadius: 99,
                height: 11,
                width: step === 0 ? 30 : 11,
              }}
            />
          ))}
        </View>
      </View>

      <ScreenTitle
        title={t('housegains.screens.onboarding.householdTitle')}
        description={t('housegains.screens.onboarding.householdDescription')}
      />

      {isReadOnly ? (
        <Card style={{ alignItems: 'center', flexDirection: 'row', gap: 12 }}>
          <View
            style={{
              alignItems: 'center',
              backgroundColor: color,
              borderRadius: 16,
              height: 66,
              justifyContent: 'center',
              width: 66,
            }}
          >
            <HouseGainsGlyph icon={icon} size={28} />
          </View>
          <View style={{ flex: 1 }}>
            <Label variant="eyebrow">{t('housegains.screens.onboarding.householdName')}</Label>
            <Label variant="heading">{existingHousehold.name}</Label>
          </View>
        </Card>
      ) : null}

      {!isReadOnly ? (
        <>
          <Card style={{ gap: 16 }}>
            <View style={{ alignItems: 'center', flexDirection: 'row', gap: 12 }}>
              <View
                style={{
                  alignItems: 'center',
                  backgroundColor: color,
                  borderColor: tokens.border,
                  borderRadius: 20,
                  borderWidth: tokens.borderWidth,
                  height: 84,
                  justifyContent: 'center',
                  width: 84,
                }}
              >
                <HouseGainsGlyph color={tokens.text} icon={icon} size={34} />
              </View>
              <View style={{ flex: 1 }}>
                <Label variant="heading">{t('housegains.screens.onboarding.avatarTitle')}</Label>
              </View>
            </View>
            <View style={{ gap: 8 }}>
              <Label variant="eyebrow">{t('housegains.screens.onboarding.pickIcon')}</Label>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {HOUSE_ICONS.map((houseIcon, index) => (
                  <ChoiceChip
                    accessibilityLabel={t('housegains.screens.onboarding.iconChoice', {
                      number: index + 1,
                    })}
                    key={houseIcon}
                    onPress={() => setIcon(houseIcon)}
                    selected={icon === houseIcon}
                    style={{ borderRadius: 12, height: 48, minHeight: 48, paddingHorizontal: 14 }}
                    testID={`housegains.onboarding.icon.${index}`}
                    title={houseIcon}
                  />
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 10, paddingTop: 2 }}>
                {HOUSE_COLORS.map((houseColor, index) => (
                  <Pressable
                    accessibilityLabel={t('housegains.screens.onboarding.colorChoice', {
                      number: index + 1,
                    })}
                    accessibilityRole="button"
                    accessibilityState={{ selected: color === houseColor }}
                    key={houseColor}
                    onPress={() => setColor(houseColor)}
                    style={{
                      alignItems: 'center',
                      borderColor: tokens.text,
                      borderRadius: 999,
                      borderWidth: color === houseColor ? 3 : 1,
                      height: 42,
                      justifyContent: 'center',
                      width: 42,
                    }}
                    testID={`housegains.onboarding.color.${index}`}
                  >
                    <View
                      style={{
                        backgroundColor: houseColor,
                        borderRadius: 999,
                        height: 32,
                        width: 32,
                      }}
                    />
                  </Pressable>
                ))}
              </View>
            </View>
          </Card>

          <FormField
            autoCapitalize="words"
            label={t('housegains.screens.onboarding.householdName')}
            maxLength={30}
            onChangeText={setName}
            placeholder={t('housegains.screens.onboarding.householdNamePlaceholder')}
            returnKeyType="done"
            testID="housegains.onboarding.householdName"
            value={name}
          />
          <Label variant="caption">{t('housegains.screens.onboarding.nameLength')}</Label>
        </>
      ) : null}

      {hasError ? (
        <Card style={{ borderColor: tokens.danger }}>
          <Label style={{ color: tokens.danger }}>
            {t('housegains.screens.common.actionError')}
          </Label>
        </Card>
      ) : null}

      <View style={{ flex: 1 }} />
      <Button
        disabled={!validName || saving}
        onPress={() => void submit()}
        testID="housegains.onboarding.next"
        title={
          isReadOnly
            ? t('housegains.screens.common.continue')
            : isEditing
              ? t('housegains.screens.settings.saveHousehold')
              : t('housegains.screens.onboarding.nextCatalog')
        }
      />
      {!isReadOnly && !isEditing ? (
        <Button
          onPress={onJoin}
          title={t('housegains.screens.onboarding.joinHousehold')}
          variant="ghost"
        />
      ) : null}
      {onDeleteAccount && existingHousehold === null ? (
        <Button
          onPress={onDeleteAccount}
          testID="housegains.createHousehold.deleteAccount"
          title={t('housegains.account.deleteAccount')}
          variant="ghost"
        />
      ) : null}
    </Screen>
  );
}

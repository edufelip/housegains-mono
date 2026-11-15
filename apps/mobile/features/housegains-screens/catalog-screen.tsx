import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Button, Card, Label, Screen } from '@/components/housegains/ui';
import { useAppearance } from '@/features/appearance';
import { CATALOG, type Chore } from '@/features/household';
import { useHouseGainsTranslation } from '@/localization/housegains';
import { ChoiceChip, HouseGainsGlyph, ScreenTitle } from './screen-elements';

const CATEGORIES = ['all', ...new Set(CATALOG.map((chore) => chore.category))];

export function CatalogScreen({
  selectedChores,
  onToggle,
  onOpenChore,
  onBuildCustom,
  onBack,
  onNext,
  mode = 'setup',
  hasError,
}: {
  selectedChores: Chore[];
  onToggle(chore: Chore, selected: boolean): Promise<void>;
  onOpenChore(choreId: string): void;
  onBuildCustom(): void;
  onBack(): void;
  onNext(): void;
  mode?: 'setup' | 'manage';
  hasError: boolean;
}) {
  const { tokens } = useAppearance();
  const { t } = useHouseGainsTranslation();
  const [category, setCategory] = useState('all');
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const pendingIdsRef = useRef(new Set<string>());
  const pendingSelectionRef = useRef(new Map<string, { selected: boolean }>());
  useEffect(() => {
    for (const id of pendingIdsRef.current) {
      const selected = selectedChores.some((saved) => saved.id === id || saved.catalogId === id);
      if (selected === pendingSelectionRef.current.get(id)?.selected) {
        pendingIdsRef.current.delete(id);
        pendingSelectionRef.current.delete(id);
      }
    }
    setPendingIds(new Set(pendingIdsRef.current));
  }, [selectedChores]);
  const visibleCatalog =
    category === 'all' ? CATALOG : CATALOG.filter((chore) => chore.category === category);
  const totalXp = selectedChores.reduce(
    (sum, chore) =>
      sum +
      chore.subtasks.reduce((subtaskXp, subtask) => subtaskXp + subtask.xp, 0) +
      chore.bonusXp,
    0,
  );

  const toggle = async (chore: Chore, isSelected: boolean) => {
    if (pendingIdsRef.current.has(chore.id)) return;
    pendingIdsRef.current.add(chore.id);
    const pending = { selected: !isSelected };
    pendingSelectionRef.current.set(chore.id, pending);
    setPendingIds(new Set(pendingIdsRef.current));
    const release = () => {
      if (pendingSelectionRef.current.get(chore.id) !== pending) return;
      pendingIdsRef.current.delete(chore.id);
      pendingSelectionRef.current.delete(chore.id);
      setPendingIds(new Set(pendingIdsRef.current));
    };
    try {
      await onToggle(chore, isSelected);
      // Fallback when the snapshot never matches, e.g. another device changed the same chore.
      setTimeout(release, 5_000);
    } catch {
      // The owning route shows a localized error and leaves the catalog state unchanged.
      release();
    }
  };

  return (
    <Screen
      contentContainerStyle={{ gap: 16, padding: 18, paddingBottom: 26 }}
      testID="housegains.onboarding.catalog"
    >
      <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}>
        <Pressable
          accessibilityLabel={t('housegains.screens.common.back')}
          accessibilityRole="button"
          onPress={onBack}
        >
          <Ionicons color={tokens.text} name="chevron-back" size={28} />
        </Pressable>
        {mode === 'setup' ? (
          <>
            <Label variant="eyebrow">
              {t('housegains.screens.onboarding.stepCount', { step: 2, total: 4 })}
            </Label>
            <Label>{t('housegains.screens.onboarding.stepLabel', { step: 2 })}</Label>
          </>
        ) : (
          <Label variant="eyebrow">{t('housegains.screens.chores.addFromCatalog')}</Label>
        )}
      </View>
      <ScreenTitle
        title={t(
          mode === 'setup'
            ? 'housegains.screens.catalog.title'
            : 'housegains.screens.chores.addCatalogTitle',
        )}
        description={t(
          mode === 'setup'
            ? 'housegains.screens.catalog.description'
            : 'housegains.screens.chores.addCatalogDescription',
        )}
      />

      <ScrollView
        horizontal
        contentContainerStyle={{ gap: 8 }}
        showsHorizontalScrollIndicator={false}
      >
        {CATEGORIES.map((choice) => (
          <ChoiceChip
            key={choice}
            onPress={() => setCategory(choice)}
            selected={category === choice}
            testID={`housegains.catalog.category.${choice}`}
            title={t(`housegains.screens.catalog.category.${choice}`)}
          />
        ))}
      </ScrollView>

      {visibleCatalog.map((chore) => {
        const selected = selectedChores.some(
          (saved) => saved.id === chore.id || saved.catalogId === chore.id,
        );
        const name = t(`housegains.catalog.${chore.id}.name`);
        const choreXp =
          chore.subtasks.reduce((sum, subtask) => sum + subtask.xp, 0) + chore.bonusXp;
        return (
          <Card
            key={chore.id}
            style={{ gap: 10, padding: 13 }}
            testID={`housegains.catalog.item.${chore.id}`}
          >
            <Pressable
              accessibilityLabel={t('housegains.screens.catalog.openDetails', { name })}
              accessibilityRole="button"
              onPress={() => onOpenChore(chore.id)}
              style={{ alignItems: 'center', flexDirection: 'row', gap: 11 }}
            >
              <View
                style={{
                  alignItems: 'center',
                  backgroundColor: selected ? tokens.primary : tokens.accent,
                  borderColor: tokens.border,
                  borderRadius: 13,
                  borderWidth: tokens.borderWidth,
                  height: 48,
                  justifyContent: 'center',
                  width: 48,
                }}
              >
                <HouseGainsGlyph color={tokens.text} icon={chore.icon} size={23} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Label style={{ fontWeight: '800' }}>{name}</Label>
                <Label variant="caption">
                  {t('housegains.screens.catalog.choreMeta', {
                    count: chore.subtasks.length,
                    recurrence: recurrenceLabel(chore.recurrence, t),
                  })}
                </Label>
              </View>
              <Label
                style={{
                  backgroundColor: tokens.accent,
                  borderRadius: 999,
                  fontWeight: '800',
                  paddingHorizontal: 9,
                  paddingVertical: 5,
                }}
              >
                {t('housegains.screens.common.xp', { xp: choreXp })}
              </Label>
            </Pressable>
            <View
              style={{
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'space-between',
              }}
            >
              <Label variant="caption">
                {chore.subtasks
                  .map((subtask) => t(`housegains.catalog.subtask.${subtask.id}`))
                  .join(' · ')}
              </Label>
              <Pressable
                accessibilityLabel={t(
                  selected ? 'housegains.screens.catalog.remove' : 'housegains.screens.catalog.add',
                  { name },
                )}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: pendingIds.has(chore.id) }}
                disabled={pendingIds.has(chore.id) || (mode === 'manage' && selected)}
                onPress={() => void toggle(chore, selected)}
                style={{
                  alignItems: 'center',
                  backgroundColor: selected ? tokens.primary : tokens.surface,
                  borderColor: tokens.border,
                  borderRadius: 999,
                  borderWidth: tokens.borderWidth,
                  height: 42,
                  justifyContent: 'center',
                  width: 42,
                }}
                testID={`housegains.catalog.toggle.${chore.id}`}
              >
                <Ionicons
                  color={selected ? tokens.onPrimary : tokens.text}
                  name={selected ? 'checkmark' : 'add'}
                  size={23}
                />
              </Pressable>
            </View>
          </Card>
        );
      })}

      <Button
        onPress={onBuildCustom}
        title={t('housegains.screens.catalog.buildCustom')}
        variant="outline"
      />
      {hasError ? (
        <Card style={{ borderColor: tokens.danger }}>
          <Label style={{ color: tokens.danger }}>
            {t('housegains.screens.common.actionError')}
          </Label>
        </Card>
      ) : null}

      <View
        style={{
          borderColor: tokens.border,
          borderTopWidth: tokens.borderWidth,
          gap: 11,
          paddingTop: 14,
        }}
      >
        <View
          style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}
        >
          <Label style={{ fontWeight: '800' }}>
            {t('housegains.screens.catalog.selectedCount', { count: selectedChores.length })}
          </Label>
          <Label style={{ color: tokens.muted, fontWeight: '700' }}>
            {t('housegains.screens.catalog.selectedXp', { xp: totalXp })}
          </Label>
        </View>
        <Button
          onPress={onNext}
          title={t(
            mode === 'setup'
              ? 'housegains.screens.catalog.nextInvite'
              : 'housegains.screens.chores.returnToChores',
          )}
          testID="housegains.catalog.next"
        />
      </View>
    </Screen>
  );
}

function recurrenceLabel(
  recurrence: string,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  if (recurrence === 'daily') return t('housegains.screens.common.daily');
  if (recurrence === 'weekly') return t('housegains.screens.common.weekly');
  if (recurrence.startsWith('weekly:')) {
    const weekdays = recurrence
      .slice('weekly:'.length)
      .split(',')
      .map((day) => Number(day))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
      .map((day) => t(`housegains.screens.common.weekday.${day}`));
    return t('housegains.screens.common.weeklyDays', { days: weekdays.join(', ') });
  }
  if (recurrence.startsWith('every:')) {
    return t('housegains.screens.common.everyDays', {
      count: Number(recurrence.slice('every:'.length)),
    });
  }
  return t('housegains.screens.common.customRecurrence');
}

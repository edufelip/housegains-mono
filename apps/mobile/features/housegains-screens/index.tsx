import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button, Card, Label, Screen } from '@/components/housegains/ui';
import { ArcadeDashboard, SoftDashboard, StickerDashboard } from '@/components/housegains/variants';
import { useAppearance } from '@/features/appearance';
import { CATALOG, useHousehold } from '@/features/household';
import { ReminderOffer } from '@/features/notifications/reminder-offer';
import { useReminderTokenSync } from '@/features/notifications/reminders';
import ThemePickerScreen from '@/features/onboarding/theme-picker-screen';
import { useHouseGainsTranslation } from '@/localization/housegains';
import { DeleteAccountScreen } from './account-screens';
import { CatalogScreen } from './catalog-screen';
import {
  BuilderScreen,
  CatalogDetailScreen,
  CelebrationScreen,
  ChoreDetailScreen,
  ChoreListScreen,
} from './chore-screen-components';
import { CreateHouseholdScreen } from './create-household-screen';
import {
  AssignChoresScreen,
  InviteHousematesScreen,
  JoinHouseholdScreen,
} from './household-flow-screens';
import {
  HouseholdFeedScreen,
  HouseholdRanksScreen,
  HouseGainsSettingsScreen,
} from './main-tab-screens';
import {
  resolveInstanceChore,
  deriveTotalXp,
  filterInstancesForHouseholdDate,
  makeChoreCopy,
} from './screen-model';
import type { AppTab, HouseGainsScreen } from './screen-types';
import type { Member } from '@/features/household/types';

function makeLocalId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function LoadingScreen() {
  const { tokens } = useAppearance();
  const { t } = useHouseGainsTranslation();
  return (
    <Screen scrollable={false} testID="housegains.loading">
      <View style={{ alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center' }}>
        <ActivityIndicator color={tokens.primary} size="large" />
        <Label>{t('housegains.screens.common.loading')}</Label>
      </View>
    </Screen>
  );
}

function OfflineRetryScreen({ onRetry }: { onRetry(): Promise<void> }) {
  const { tokens } = useAppearance();
  const { t } = useHouseGainsTranslation();
  const [busy, setBusy] = useState(false);
  const retry = async () => {
    setBusy(true);
    try {
      await onRetry();
    } catch {
      // The retry screen remains available after a storage failure.
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen
      contentContainerStyle={{ flexGrow: 1, gap: 14, justifyContent: 'center', padding: 24 }}
      testID="housegains.storageError"
    >
      <Card style={{ gap: 12 }}>
        <Label variant="heading">{t('housegains.screens.common.loadErrorTitle')}</Label>
        <Label>{t('housegains.screens.common.loadErrorBody')}</Label>
        <Button
          disabled={busy}
          onPress={() => void retry()}
          title={t('housegains.screens.common.retry')}
          variant="outline"
        />
      </Card>
    </Screen>
  );
}

/** The app entry: screens plus the one-time reminder offer and the device-token sync. */
export function HouseGainsApp() {
  const [offerRequested, setOfferRequested] = useState(false);
  const handleOfferDone = useCallback(() => setOfferRequested(false), []);
  useReminderTokenSync();
  return (
    <>
      <HouseGainsScreens onHouseholdReady={() => setOfferRequested(true)} />
      <ReminderOffer onHandled={handleOfferDone} requested={offerRequested} />
    </>
  );
}

/** The app entry uses providers from the Expo Router root and reads invite paths from route params. */
function HouseGainsScreens({ onHouseholdReady }: { onHouseholdReady(): void }) {
  const routeParams = useLocalSearchParams<{ code?: string | string[] }>();
  const routeCodeValue = Array.isArray(routeParams.code) ? routeParams.code[0] : routeParams.code;
  const routeInviteCode =
    typeof routeCodeValue === 'string' ? routeCodeValue.toUpperCase() : undefined;
  const appearance = useAppearance();
  const householdData = useHousehold();
  const { t } = useHouseGainsTranslation();
  const data = useMemo(() => {
    // Translate generated local placeholders while keeping real names and storage intact.
    const displayMember = (member: Member): Member => {
      if (member.name === 'You' && member.initials === 'YO') {
        const name = t('housegains.preview.you');
        return { ...member, name, initials: name.slice(0, 2).toUpperCase() };
      }
      const number = /^Member (\d+)$/.exec(member.name)?.[1];
      return number && member.initials === `M${number}`
        ? { ...member, name: `${t('housegains.screens.common.role.member')} ${number}` }
        : member;
    };
    return {
      ...householdData,
      currentMember: displayMember(householdData.currentMember),
      household: householdData.household
        ? {
            ...householdData.household,
            members: householdData.household.members.map(displayMember),
          }
        : null,
    };
  }, [householdData, t]);
  const [screen, setScreen] = useState<HouseGainsScreen>({ name: 'theme-picker' });
  const [actionError, setActionError] = useState(false);
  const initialized = useRef(false);
  const handledInviteCode = useRef<string | null>(null);

  const go = (next: HouseGainsScreen) => {
    setActionError(false);
    setScreen(next);
  };

  const perform = async (operation: () => Promise<void>) => {
    setActionError(false);
    try {
      await operation();
    } catch (error) {
      setActionError(true);
      throw error;
    }
  };

  useEffect(() => {
    if (!appearance.hydrated || !data.hydrated) return;
    if (!appearance.selected) {
      setScreen({ name: 'theme-picker' });
      return;
    }
    if (routeInviteCode && handledInviteCode.current !== routeInviteCode) {
      initialized.current = true;
      setScreen({ name: 'join' });
      return;
    }
    if (initialized.current) return;
    initialized.current = true;
    if (!data.household) setScreen({ name: 'create-household' });
    else if (!data.setupComplete && data.currentMember.role === 'creator') {
      setScreen({ name: 'catalog', mode: 'setup' });
    } else setScreen({ name: 'today' });
  }, [
    appearance.hydrated,
    appearance.selected,
    data.currentMember.role,
    data.hydrated,
    data.household,
    data.setupComplete,
    routeInviteCode,
  ]);

  const afterThemeContinue = () => {
    if (routeInviteCode && handledInviteCode.current !== routeInviteCode) {
      go({ name: 'join' });
      return;
    }
    if (!data.household) go({ name: 'create-household' });
    else if (!data.setupComplete && data.currentMember.role === 'creator') {
      go({ name: 'catalog', mode: 'setup' });
    } else go({ name: 'today' });
  };

  const navigateTab = (tab: AppTab) => {
    switch (tab) {
      case 'today':
        go({ name: 'today' });
        break;
      case 'feed':
        go({ name: 'feed' });
        break;
      case 'add':
        go({ name: 'chore-list', returnTo: 'today' });
        break;
      case 'ranks':
        go({ name: 'ranks' });
        break;
      case 'me':
        go({ name: 'settings' });
        break;
    }
  };

  const returnToMain = (destination: 'today' | 'settings') =>
    destination === 'settings' ? { name: 'settings' as const } : { name: 'today' as const };

  if (!appearance.hydrated || !data.hydrated) return <LoadingScreen />;
  if (
    data.error &&
    !data.household &&
    screen.name !== 'create-household' &&
    screen.name !== 'theme-picker'
  ) {
    return <OfflineRetryScreen onRetry={data.retryHydration} />;
  }

  if (screen.name === 'theme-picker') return <ThemePickerScreen onContinue={afterThemeContinue} />;

  if (screen.name === 'create-household') {
    return (
      <CreateHouseholdScreen
        existingHousehold={data.household}
        hasError={actionError}
        onCancel={() => go({ name: 'theme-picker' })}
        onContinue={() => go({ name: 'catalog', mode: 'setup' })}
        onCreate={(name, icon, color) =>
          perform(async () => {
            await data.createHousehold(name, icon, color);
            onHouseholdReady();
            go({ name: 'catalog', mode: 'setup' });
          })
        }
        onDeleteAccount={() => go({ name: 'delete-account' })}
        onJoin={() => go({ name: 'join' })}
      />
    );
  }

  if (screen.name === 'catalog') {
    return (
      <CatalogScreen
        hasError={actionError}
        mode={screen.mode}
        onBack={() =>
          screen.mode === 'setup'
            ? go({ name: 'create-household' })
            : go(returnToMain(screen.choreListReturnTo ?? 'today'))
        }
        onBuildCustom={() =>
          go({
            name: 'builder',
            returnTo: screen.mode === 'setup' ? 'catalog' : 'chore-list',
            choreListReturnTo: screen.choreListReturnTo,
          })
        }
        onNext={() =>
          screen.mode === 'setup'
            ? go({ name: 'invite' })
            : go({ name: 'chore-list', returnTo: screen.choreListReturnTo ?? 'today' })
        }
        onOpenChore={(choreId) =>
          go({
            name: 'catalog-detail',
            choreId,
            returnTo: screen.mode === 'setup' ? 'catalog' : 'chore-list',
            choreListReturnTo: screen.choreListReturnTo,
          })
        }
        onToggle={(catalogChore, selected) =>
          perform(async () => {
            if (selected) {
              const saved = data.chores.find(
                (chore) => chore.id === catalogChore.id || chore.catalogId === catalogChore.id,
              );
              if (saved) await data.deleteChore(saved.id);
              return;
            }
            const copy =
              screen.mode === 'setup'
                ? { ...catalogChore, assigneeIds: [] }
                : makeChoreCopy(catalogChore, makeLocalId('chore'));
            await data.saveChore(copy);
          })
        }
        selectedChores={data.chores}
      />
    );
  }

  if (screen.name === 'invite') {
    if (!data.household)
      return (
        <CreateHouseholdScreen
          existingHousehold={null}
          onCreate={data.createHousehold}
          onJoin={() => go({ name: 'join' })}
          hasError={actionError}
        />
      );
    return (
      <InviteHousematesScreen
        household={data.household}
        currentMember={data.currentMember}
        hasError={actionError}
        onBack={() =>
          go(
            screen.returnTo === 'settings'
              ? { name: 'settings' }
              : { name: 'catalog', mode: 'setup' },
          )
        }
        onRegenerate={() => perform(() => data.regenerateInvite())}
        onSkip={() =>
          go(screen.returnTo === 'settings' ? { name: 'settings' } : { name: 'assignments' })
        }
        returnTo={screen.returnTo ?? 'setup'}
      />
    );
  }

  if (screen.name === 'assignments') {
    if (!data.household)
      return (
        <CreateHouseholdScreen
          existingHousehold={null}
          onCreate={data.createHousehold}
          onJoin={() => go({ name: 'join' })}
          hasError={actionError}
        />
      );
    return (
      <AssignChoresScreen
        household={data.household}
        chores={data.chores}
        members={data.household.members}
        currentMember={data.currentMember}
        hasError={actionError}
        onBack={() => go({ name: 'invite' })}
        onFinish={() =>
          perform(async () => {
            await data.finishSetup();
            go({ name: 'today' });
          })
        }
        onSetAssignments={(choreId, memberIds) =>
          perform(() => data.setAssignments(choreId, memberIds))
        }
      />
    );
  }

  if (screen.name === 'join') {
    return (
      <JoinHouseholdScreen
        initialCode={routeInviteCode}
        household={data.household}
        choreCount={data.chores.length}
        hasError={actionError}
        onBack={() => {
          if (routeInviteCode) handledInviteCode.current = routeInviteCode;
          if (data.household) {
            if (data.setupComplete) go({ name: 'today' });
            else go({ name: 'catalog', mode: 'setup' });
          } else go({ name: 'create-household' });
        }}
        onJoin={(code) =>
          perform(async () => {
            await data.joinHousehold(code);
            onHouseholdReady();
            handledInviteCode.current = code;
            if (routeInviteCode === code) handledInviteCode.current = routeInviteCode;
            go({ name: 'today' });
          })
        }
      />
    );
  }

  if (screen.name === 'today') {
    if (!data.household)
      return (
        <CreateHouseholdScreen
          existingHousehold={null}
          onCreate={data.createHousehold}
          onJoin={() => go({ name: 'join' })}
          hasError={actionError}
        />
      );
    const timeZone = data.household.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    const todayInstances = filterInstancesForHouseholdDate(data.instances, new Date(), timeZone);
    const totalXp = deriveTotalXp(data.xpLedger, data.currentMember.id);
    const props = {
      themeId: appearance.themeId,
      household: data.household,
      members: data.household.members,
      currentMember: data.currentMember,
      chores: data.chores,
      instances: todayInstances,
      weeklyTotals: data.weeklyTotals,
      weeklyGoalXp: data.household.weeklyGoalXp ?? null,
      totalXp,
      streak: data.streak,
      onOpenInstance: (instanceId: string) => go({ name: 'chore-detail', instanceId }),
      onNavigate: navigateTab,
    };
    if (appearance.themeId === 'arcade') return <ArcadeDashboard {...props} />;
    if (appearance.themeId === 'sticker') return <StickerDashboard {...props} />;
    return <SoftDashboard {...props} />;
  }

  if (screen.name === 'feed') {
    if (!data.household)
      return (
        <CreateHouseholdScreen
          existingHousehold={null}
          onCreate={data.createHousehold}
          onJoin={() => go({ name: 'join' })}
          hasError={actionError}
        />
      );
    return (
      <HouseholdFeedScreen
        household={data.household}
        members={[...data.household.members, ...(data.household.formerMembers ?? [])]}
        chores={data.chores}
        instances={data.instances}
        feed={data.feed}
        onNavigate={navigateTab}
      />
    );
  }

  if (screen.name === 'ranks') {
    if (!data.household)
      return (
        <CreateHouseholdScreen
          existingHousehold={null}
          onCreate={data.createHousehold}
          onJoin={() => go({ name: 'join' })}
          hasError={actionError}
        />
      );
    return (
      <HouseholdRanksScreen
        household={data.household}
        members={data.household.members}
        weeklyTotals={data.weeklyTotals}
        currentMember={data.currentMember}
        onNavigate={navigateTab}
      />
    );
  }

  if (screen.name === 'settings') {
    if (!data.household)
      return (
        <CreateHouseholdScreen
          existingHousehold={null}
          onCreate={data.createHousehold}
          onJoin={() => go({ name: 'join' })}
          hasError={actionError}
        />
      );
    return (
      <HouseGainsSettingsScreen
        household={data.household}
        currentMember={data.currentMember}
        hasError={actionError}
        onError={setActionError}
        onNavigate={navigateTab}
        onOpenChores={() => go({ name: 'chore-list', returnTo: 'settings' })}
        onOpenInvite={() => go({ name: 'invite', returnTo: 'settings' })}
        onEditHousehold={() => go({ name: 'household-edit' })}
        onSelectTheme={(themeId) => appearance.selectTheme(themeId)}
        onDeleteAccount={() => go({ name: 'delete-account' })}
        onLeftHousehold={() => go({ name: 'create-household' })}
      />
    );
  }

  if (screen.name === 'delete-account') {
    return (
      <DeleteAccountScreen
        onCancel={() => go(data.household ? { name: 'settings' } : { name: 'create-household' })}
      />
    );
  }

  if (screen.name === 'household-edit') {
    return (
      <CreateHouseholdScreen
        existingHousehold={data.household}
        editMode
        hasError={actionError}
        onCancel={() => go({ name: 'settings' })}
        onCreate={data.createHousehold}
        onSave={(name, icon, color) =>
          perform(async () => {
            await data.updateHousehold(name, icon, color);
            go({ name: 'settings' });
          })
        }
        onJoin={() => go({ name: 'join' })}
      />
    );
  }

  if (screen.name === 'chore-list') {
    if (!data.household)
      return (
        <CreateHouseholdScreen
          existingHousehold={null}
          onCreate={data.createHousehold}
          onJoin={() => go({ name: 'join' })}
          hasError={actionError}
        />
      );
    return (
      <ChoreListScreen
        household={data.household}
        currentMember={data.currentMember}
        chores={data.chores}
        members={data.household.members}
        hasError={actionError}
        onBack={() => go(returnToMain(screen.returnTo))}
        onAddCatalog={() =>
          go({ name: 'catalog', mode: 'manage', choreListReturnTo: screen.returnTo })
        }
        onBuildCustom={() =>
          go({ name: 'builder', returnTo: 'chore-list', choreListReturnTo: screen.returnTo })
        }
        onEdit={(choreId) =>
          go({
            name: 'builder',
            choreId,
            returnTo: 'chore-list',
            choreListReturnTo: screen.returnTo,
          })
        }
        onPause={(choreId) => {
          const chore = data.chores.find(({ id }) => id === choreId);
          if (!chore) return;
          const operation = chore.isActive
            ? () => data.pauseChore(choreId)
            : () => data.saveChore({ ...chore, isActive: true });
          void perform(operation).catch(() => undefined);
        }}
        onDelete={(choreId) => void perform(() => data.deleteChore(choreId)).catch(() => undefined)}
        onAssign={(choreId, memberIds) => perform(() => data.setAssignments(choreId, memberIds))}
      />
    );
  }

  if (screen.name === 'catalog-detail') {
    const chore = CATALOG.find(({ id }) => id === screen.choreId);
    if (!chore) return <FallbackScreen onBack={() => go({ name: 'catalog', mode: 'setup' })} />;
    const returnScreen = () =>
      screen.returnTo === 'catalog'
        ? { name: 'catalog' as const, mode: 'setup' as const }
        : { name: 'chore-list' as const, returnTo: screen.choreListReturnTo ?? 'today' };
    return (
      <CatalogDetailScreen
        chore={chore}
        onBack={() => go(returnScreen())}
        onCustomize={(template) =>
          go({
            name: 'builder',
            templateId: template.id,
            returnTo: screen.returnTo,
            choreListReturnTo: screen.choreListReturnTo,
          })
        }
        onUseAsIs={(template) =>
          perform(async () => {
            await data.saveChore(makeChoreCopy(template, makeLocalId('chore')));
            go(returnScreen());
          })
        }
      />
    );
  }

  if (screen.name === 'builder') {
    const initialChore = screen.choreId
      ? (data.chores.find(({ id }) => id === screen.choreId) ?? null)
      : null;
    const template = screen.templateId
      ? (CATALOG.find(({ id }) => id === screen.templateId) ?? null)
      : null;
    const returnScreen = () =>
      screen.returnTo === 'catalog'
        ? { name: 'catalog' as const, mode: 'setup' as const }
        : { name: 'chore-list' as const, returnTo: screen.choreListReturnTo ?? 'today' };
    return (
      <BuilderScreen
        initialChore={initialChore}
        template={template}
        members={data.household?.members ?? []}
        hasError={actionError}
        onCancel={() => go(returnScreen())}
        onSave={(chore) =>
          perform(async () => {
            await data.saveChore(chore);
            go(returnScreen());
          })
        }
      />
    );
  }

  if (screen.name === 'chore-detail') {
    const instance = data.instances.find(({ id }) => id === screen.instanceId);
    const chore = instance ? resolveInstanceChore(instance, data.chores) : undefined;
    if (!instance || !chore || !data.household)
      return <FallbackScreen onBack={() => go({ name: 'today' })} />;
    return (
      <ChoreDetailScreen
        householdId={data.household.id}
        instance={instance}
        chore={chore}
        members={[...data.household.members, ...(data.household.formerMembers ?? [])]}
        currentMember={data.currentMember}
        hasError={actionError}
        onBack={() => go({ name: 'today' })}
        onComplete={(instanceId, subtaskId) => {
          const latest = data.instances.find(({ id }) => id === instanceId);
          if (!latest) return Promise.reject(new Error('Missing instance.'));
          const completedIds = new Set(latest.completions.map(({ subtaskId }) => subtaskId));
          const willFinish =
            !completedIds.has(subtaskId) &&
            latest.subtasks.every(({ id }) => id === subtaskId || completedIds.has(id)) &&
            Date.parse(latest.dueAt) > Date.now();
          return perform(async () => {
            await data.completeSubtask(instanceId, subtaskId);
            if (willFinish) go({ name: 'celebration', instanceId });
          });
        }}
        onUndo={(instanceId, subtaskId) => perform(() => data.undoSubtask(instanceId, subtaskId))}
      />
    );
  }

  if (screen.name === 'celebration') {
    const instance = data.instances.find(({ id }) => id === screen.instanceId);
    const chore = instance ? resolveInstanceChore(instance, data.chores) : undefined;
    if (!instance || !chore || !data.household)
      return <FallbackScreen onBack={() => go({ name: 'today' })} />;
    return (
      <CelebrationScreen
        instance={instance}
        chore={chore}
        members={[...data.household.members, ...(data.household.formerMembers ?? [])]}
        currentMember={data.currentMember}
        hasError={actionError}
        onBack={() => go({ name: 'today' })}
        onPostToFeed={(instanceId) =>
          perform(async () => {
            await data.postCompletion(instanceId);
            go({ name: 'feed' });
          })
        }
      />
    );
  }

  return <FallbackScreen onBack={() => go({ name: 'today' })} />;
}

function FallbackScreen({ onBack }: { onBack(): void }) {
  const { t } = useHouseGainsTranslation();
  return (
    <Screen contentContainerStyle={{ flexGrow: 1, gap: 12, justifyContent: 'center', padding: 24 }}>
      <Card style={{ gap: 12 }}>
        <Label variant="heading">{t('housegains.screens.common.unavailableTitle')}</Label>
        <Label>{t('housegains.screens.common.unavailableBody')}</Label>
        <Button onPress={onBack} title={t('housegains.screens.common.back')} variant="outline" />
      </Card>
    </Screen>
  );
}

import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { LanguagePicker } from '@/components/housegains/language-picker';
import { Button, Card, Label, Screen } from '@/components/housegains/ui';
import { ArcadeDock, SoftDock, StickerDock } from '@/components/housegains/variants';
import { resolvePickerCopy, useAppearance, type StyleId } from '@/features/appearance';
import { useHouseGainsTranslation } from '@/localization/housegains';
import { AboutSection, AccountSection, ReminderSection } from './account-screens';
import { HouseholdPeopleSection } from './household-safety';
import { MemberBadge, ScreenTitle } from './screen-elements';
import { deriveScoreSnapshot, resolveInstanceChore, choreDisplayName } from './screen-model';
import type { AppTab } from './screen-types';
import type {
  Chore,
  FeedPost,
  Household,
  Instance,
  Member,
  WeekStandings,
} from '@/features/household';

function MainTabShell({
  active,
  onNavigate,
  children,
}: {
  active: AppTab;
  onNavigate(tab: AppTab): void;
  children: ReactNode;
}) {
  const { themeId } = useAppearance();
  const dock =
    themeId === 'arcade' ? (
      <ArcadeDock active={active} onNavigate={onNavigate} />
    ) : themeId === 'sticker' ? (
      <StickerDock active={active} onNavigate={onNavigate} />
    ) : (
      <SoftDock active={active} onNavigate={onNavigate} />
    );
  return (
    <Screen scrollable={false} testID={`housegains.tab.${active}`}>
      <View style={{ flex: 1, width: '100%' }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, gap: 16, padding: 18, paddingBottom: 12 }}
        >
          {children}
        </ScrollView>
        {dock}
      </View>
    </Screen>
  );
}

export function HouseholdFeedScreen({
  household,
  members,
  chores,
  instances,
  feed,
  onNavigate,
}: {
  household: Household;
  members: Member[];
  chores: Chore[];
  instances: Instance[];
  feed: FeedPost[];
  onNavigate(tab: AppTab): void;
}) {
  const { tokens } = useAppearance();
  const { t, locale } = useHouseGainsTranslation();
  const posts = [...feed].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return (
    <MainTabShell active="feed" onNavigate={onNavigate}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Label variant="eyebrow">{household.name}</Label>
          <ScreenTitle
            title={t('housegains.screens.feed.title')}
            description={t('housegains.screens.feed.description')}
          />
        </View>
        <Ionicons color={tokens.primary} name="images-outline" size={28} />
      </View>
      {posts.length === 0 ? (
        <Card style={{ gap: 8, padding: 18 }}>
          <Label variant="heading">{t('housegains.screens.feed.emptyTitle')}</Label>
          <Label>{t('housegains.screens.feed.emptyBody')}</Label>
        </Card>
      ) : (
        posts.map((post) => {
          const instance = instances.find(({ id }) => id === post.instanceId);
          const chore = instance ? resolveInstanceChore(instance, chores) : undefined;
          const member = members.find(({ id }) => id === post.memberId);
          const name = chore
            ? choreDisplayName(chore, t)
            : t('housegains.screens.feed.choreUnavailable');
          const postedAt = new Intl.DateTimeFormat(locale, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(post.createdAt));
          return (
            <Card
              key={post.id}
              style={{ gap: 11, padding: 15 }}
              testID={`housegains.feed.post.${post.id}`}
            >
              <View style={{ alignItems: 'center', flexDirection: 'row', gap: 10 }}>
                <MemberBadge
                  accessibilityLabel={
                    member?.name ?? t('housegains.screens.feed.memberUnavailable')
                  }
                  color={member?.color ?? tokens.accent}
                  initials={member?.initials ?? '?'}
                  size={42}
                />
                <View style={{ flex: 1 }}>
                  <Label style={{ fontWeight: '800' }}>
                    {t('housegains.screens.feed.completionPost', {
                      member: member?.name ?? t('housegains.screens.feed.memberUnavailable'),
                      chore: name,
                    })}
                  </Label>
                  <Label variant="caption">{postedAt}</Label>
                </View>
                <Ionicons color={tokens.success} name="checkmark-circle" size={22} />
              </View>
              {instance ? (
                <Label variant="caption">
                  {t('housegains.screens.feed.completedSubtasks', {
                    done: instance.completions.length,
                    total: instance.subtasks.length,
                  })}
                </Label>
              ) : null}
            </Card>
          );
        })
      )}
    </MainTabShell>
  );
}

export function HouseholdRanksScreen({
  household,
  members,
  weeklyTotals,
  currentMember,
  lastWeek,
  organizerCard,
  onNavigate,
}: {
  household: Household;
  members: Member[];
  weeklyTotals: Record<string, number>;
  currentMember: Member;
  /** Latest closed week snapshot (contract Part B), or null before any week has closed. */
  lastWeek: WeekStandings | null;
  /** The household organizer card; only passed while gamification is visible. */
  organizerCard?: ReactNode;
  onNavigate(tab: AppTab): void;
}) {
  const { tokens } = useAppearance();
  const { t } = useHouseGainsTranslation();
  const score = deriveScoreSnapshot(members, weeklyTotals, currentMember.id);
  const sorted = [...members].sort(
    (left, right) => (weeklyTotals[right.id] ?? 0) - (weeklyTotals[left.id] ?? 0),
  );
  const hasPoints = sorted.some((member) => (weeklyTotals[member.id] ?? 0) > 0);
  // Closed-week titles keep their member ids; tombstoned members still resolve by name.
  const weekMemberName = (memberId: string): string =>
    members.find((member) => member.id === memberId)?.name ??
    (household.formerMembers ?? []).find((member) => member.id === memberId)?.name ??
    t('housegains.screens.feed.memberUnavailable');
  return (
    <MainTabShell active="ranks" onNavigate={onNavigate}>
      <View>
        <Label variant="eyebrow">{household.name}</Label>
        <ScreenTitle
          title={t('housegains.screens.ranks.title')}
          description={t('housegains.screens.ranks.description')}
        />
      </View>
      {organizerCard}
      {!hasPoints ? (
        <Card style={{ gap: 7 }}>
          <Label variant="heading">{t('housegains.screens.ranks.emptyTitle')}</Label>
          <Label>{t('housegains.screens.ranks.emptyBody')}</Label>
        </Card>
      ) : null}
      <Card style={{ gap: 12 }} testID="housegains.ranks.lastWeek">
        <Label variant="heading">{t('housegains.screens.ranks.lastWeekTitle')}</Label>
        {lastWeek === null ? (
          <Label variant="caption" testID="housegains.ranks.lastWeek.empty">
            {t('housegains.screens.ranks.noWeekYet')}
          </Label>
        ) : (
          <>
            {lastWeek.topMember ? (
              <View
                style={{ alignItems: 'center', flexDirection: 'row', gap: 12 }}
                testID="housegains.ranks.lastWeek.top"
              >
                <Ionicons
                  accessibilityElementsHidden
                  color={tokens.accent}
                  name="trophy-outline"
                  size={tokens.iconSize.lg}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Label variant="caption">{t('housegains.screens.ranks.topMemberTitle')}</Label>
                  <Label style={{ fontWeight: '800' }} testID="housegains.ranks.lastWeek.topName">
                    {weekMemberName(lastWeek.topMember.memberId)}
                  </Label>
                  <Label variant="caption">
                    {t('housegains.screens.ranks.topMemberDetail', {
                      subtasks: lastWeek.topMember.subtasks,
                      xp: lastWeek.topMember.xp,
                    })}
                  </Label>
                </View>
              </View>
            ) : null}
            {lastWeek.wallOfShame ? (
              <View
                style={{ alignItems: 'center', flexDirection: 'row', gap: 12 }}
                testID="housegains.ranks.lastWeek.shame"
              >
                <Ionicons
                  accessibilityElementsHidden
                  color={tokens.danger}
                  name="alert-circle-outline"
                  size={tokens.iconSize.lg}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Label variant="caption">{t('housegains.screens.ranks.wallOfShameTitle')}</Label>
                  <Label style={{ fontWeight: '800' }} testID="housegains.ranks.lastWeek.shameName">
                    {weekMemberName(lastWeek.wallOfShame.memberId)}
                  </Label>
                  <Label variant="caption">
                    {t('housegains.screens.ranks.wallOfShameDetail', {
                      missed: lastWeek.wallOfShame.missed,
                      assigned: lastWeek.wallOfShame.assignedDue,
                    })}
                  </Label>
                </View>
              </View>
            ) : null}
          </>
        )}
      </Card>
      {sorted.map((member) => {
        const points = weeklyTotals[member.id] ?? 0;
        const rank = members.filter((item) => (weeklyTotals[item.id] ?? 0) > points).length + 1;
        const isCurrent = member.id === currentMember.id;
        return (
          <Card
            key={member.id}
            style={{
              alignItems: 'center',
              backgroundColor: isCurrent ? tokens.primary : tokens.surface,
              borderColor: isCurrent ? tokens.text : tokens.border,
              flexDirection: 'row',
              gap: 12,
              padding: 14,
            }}
          >
            <Label
              style={{
                color: isCurrent ? tokens.onPrimary : tokens.muted,
                fontWeight: '900',
                width: 32,
              }}
            >
              #{rank}
            </Label>
            <MemberBadge
              accessibilityLabel={member.name}
              color={member.color}
              initials={member.initials}
              size={42}
            />
            <View style={{ flex: 1 }}>
              <Label
                style={{ color: isCurrent ? tokens.onPrimary : tokens.text, fontWeight: '800' }}
              >
                {isCurrent ? t('housegains.screens.dashboard.you') : member.name}
              </Label>
              <Label
                variant="caption"
                style={{ color: isCurrent ? tokens.onPrimary : tokens.muted }}
              >
                {t(`housegains.screens.common.role.${member.role}`)}
              </Label>
            </View>
            <Label
              style={{ color: isCurrent ? tokens.onPrimary : tokens.primary, fontWeight: '900' }}
            >
              {t('housegains.screens.common.pointsWithValue', { points })}
            </Label>
          </Card>
        );
      })}
      <Card style={{ backgroundColor: tokens.accent, gap: 6 }}>
        <Label style={{ fontWeight: '800' }}>
          {t('housegains.screens.ranks.yourPlace', { rank: score.rank })}
        </Label>
        <Label>{t('housegains.screens.ranks.pointsThisWeek', { points: score.points })}</Label>
      </Card>
    </MainTabShell>
  );
}

export function HouseGainsSettingsScreen({
  household,
  currentMember,
  openDisputeCount,
  onNavigate,
  onOpenChores,
  onOpenReports,
  onEditHousehold,
  onOpenInvite,
  onSelectTheme,
  onDeleteAccount,
  onSetMemberRole,
  onLeftHousehold,
  hasError,
  onError,
}: {
  household: Household;
  currentMember: Member;
  /** Open disputes waiting for an admin verdict (contract A2). */
  openDisputeCount: number;
  onNavigate(tab: AppTab): void;
  onOpenChores(): void;
  onOpenReports(): void;
  onEditHousehold(): void;
  onOpenInvite(): void;
  onSelectTheme(themeId: StyleId): Promise<void>;
  onDeleteAccount(): void;
  /** Creator-only role management, passed to the people section (contract A1). */
  onSetMemberRole(memberId: string, role: 'admin' | 'member'): Promise<void>;
  onLeftHousehold(): void;
  hasError: boolean;
  onError: (hasError: boolean) => void;
}) {
  const { tokens, styleId, styles, selected: savedTheme, saveError } = useAppearance();
  const { t, locale } = useHouseGainsTranslation();
  const [themeBusy, setThemeBusy] = useState(false);
  const isCreator = currentMember.role === 'creator';
  const isAdmin = currentMember.role === 'creator' || currentMember.role === 'admin';

  const selectTheme = async (id: StyleId) => {
    if (themeBusy || (id === savedTheme && !saveError)) return;
    setThemeBusy(true);
    onError(false);
    try {
      await onSelectTheme(id);
    } catch {
      onError(true);
    } finally {
      setThemeBusy(false);
    }
  };

  return (
    <MainTabShell active="me" onNavigate={onNavigate}>
      <View>
        <Label variant="eyebrow">{household.name}</Label>
        <ScreenTitle
          title={t('housegains.screens.settings.title')}
          description={t('housegains.screens.settings.description')}
        />
      </View>
      {hasError || saveError ? (
        <Card style={{ borderColor: tokens.danger }} testID="housegains.settings.error">
          <Label style={{ color: tokens.danger }}>
            {t('housegains.screens.common.actionError')}
          </Label>
          {saveError ? (
            <Button
              disabled={themeBusy}
              onPress={() => void selectTheme(styleId)}
              title={t('housegains.screens.common.retry')}
              testID="housegains.settings.themeRetry"
            />
          ) : null}
        </Card>
      ) : null}
      <Card style={{ gap: 10 }}>
        <Label variant="heading">{t('housegains.screens.settings.household')}</Label>
        <Label>{t('housegains.screens.settings.profileSummary', { name: household.name })}</Label>
        <Button
          disabled={!isCreator}
          onPress={onEditHousehold}
          title={t(
            isCreator
              ? 'housegains.screens.settings.editHousehold'
              : 'housegains.screens.settings.readOnlyHousehold',
          )}
          variant="outline"
        />
        {isCreator ? (
          <Button
            onPress={onOpenInvite}
            title={t('housegains.screens.settings.inviteHousemates')}
            testID="housegains.settings.invite"
            variant="secondary"
          />
        ) : null}
        <Button
          onPress={onOpenChores}
          title={t(
            isCreator
              ? 'housegains.screens.settings.manageChores'
              : 'housegains.screens.settings.viewChores',
          )}
          variant="secondary"
        />
        {isAdmin ? (
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: 8 }}>
            <Button
              onPress={onOpenReports}
              style={{ flex: 1 }}
              testID="housegains.settings.reports"
              title={t('housegains.screens.settings.reports')}
              variant="secondary"
            />
            {openDisputeCount > 0 ? (
              <Label
                style={{ color: tokens.danger, fontWeight: '800' }}
                testID="housegains.settings.reports.count"
              >
                {t('housegains.screens.reports.pendingCount', { count: openDisputeCount })}
              </Label>
            ) : null}
          </View>
        ) : null}
      </Card>

      <Card style={{ gap: 12 }}>
        <Label variant="heading">{t('housegains.screens.settings.appearance')}</Label>
        <Label variant="caption">{t('housegains.screens.settings.appearanceDescription')}</Label>
        {styles.map((style) => {
          const themeTokens = style.tokens;
          const name = resolvePickerCopy(style.copy.name, locale, t);
          const description = resolvePickerCopy(style.copy.description, locale, t);
          const selected = styleId === style.id;
          return (
            <Pressable
              accessibilityLabel={t('housegains.screens.settings.selectTheme', {
                theme: name,
              })}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: themeBusy }}
              disabled={themeBusy}
              key={style.id}
              onPress={() => void selectTheme(style.id)}
              style={{
                alignItems: 'center',
                backgroundColor: themeTokens.canvas,
                borderColor: selected ? themeTokens.primary : themeTokens.border,
                borderRadius: themeTokens.radius,
                borderWidth: selected
                  ? Math.max(2, themeTokens.borderWidth)
                  : themeTokens.borderWidth,
                flexDirection: 'row',
                gap: 11,
                padding: 12,
              }}
              testID={`housegains.settings.theme.${style.id}`}
            >
              <View
                style={{
                  backgroundColor: themeTokens.primary,
                  borderColor: themeTokens.border,
                  borderRadius: 12,
                  borderWidth: themeTokens.borderWidth,
                  height: 36,
                  width: 36,
                }}
              />
              <View style={{ flex: 1 }}>
                <Label style={{ color: themeTokens.text, fontWeight: '800' }}>{name}</Label>
                <Label variant="caption" style={{ color: themeTokens.muted }}>
                  {description}
                </Label>
              </View>
              <Ionicons
                color={themeTokens.text}
                name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
              />
            </Pressable>
          );
        })}
      </Card>

      <Card style={{ gap: 10 }}>
        <LanguagePicker testIDPrefix="housegains.settings.language" />
      </Card>

      <HouseholdPeopleSection
        currentMember={currentMember}
        household={household}
        onLeft={onLeftHousehold}
        onSetMemberRole={onSetMemberRole}
      />
      <ReminderSection />
      <AccountSection onDeleteAccount={onDeleteAccount} />
      <AboutSection />
    </MainTabShell>
  );
}

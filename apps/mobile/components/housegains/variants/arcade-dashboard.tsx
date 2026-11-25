import { Ionicons } from '@expo/vector-icons';
import { ScrollView, Pressable, View } from 'react-native';
import { Button, Card, Label } from '@/components/housegains/ui';
import { useAppearance } from '@/features/appearance';
import { HouseGainsGlyph, MemberBadge } from '@/features/housegains-screens/screen-elements';
import {
  deriveDashboardSummary,
  deriveProgression,
  deriveWeeklyGoal,
  resolveInstanceChore,
  choreDisplayName,
  subtaskDisplayName,
} from '@/features/housegains-screens/screen-model';
import { useHouseGainsTranslation } from '@/localization/housegains';
import type { AppTab, DashboardProps } from '@/features/housegains-screens/screen-types';
import type { ComponentProps } from 'react';

export function ArcadeDock({
  active,
  onNavigate,
}: {
  active: AppTab;
  onNavigate(tab: AppTab): void;
}) {
  const { tokens } = useAppearance();
  const { t, locale } = useHouseGainsTranslation();
  const tabs: { id: AppTab; icon: ComponentProps<typeof Ionicons>['name']; key: string }[] = [
    { id: 'today', icon: 'home-outline', key: 'today' },
    { id: 'feed', icon: 'images-outline', key: 'feed' },
    { id: 'add', icon: 'add', key: 'add' },
    { id: 'ranks', icon: 'trophy-outline', key: 'ranks' },
    { id: 'me', icon: 'person-outline', key: 'me' },
  ];
  return (
    <View
      accessibilityRole="tablist"
      style={{
        alignItems: 'center',
        backgroundColor: tokens.surface,
        borderColor: tokens.border,
        borderRadius: 22,
        borderWidth: 1,
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginHorizontal: 14,
        marginTop: 8,
        paddingHorizontal: 5,
        paddingVertical: 6,
      }}
      testID="housegains.dock.arcade"
    >
      {tabs.map((tab) => {
        const isAdd = tab.id === 'add';
        const selected = tab.id === active;
        return (
          <Pressable
            accessibilityLabel={t(`housegains.screens.tabs.${tab.key}`)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={tab.id}
            onPress={() => onNavigate(tab.id)}
            style={{
              alignItems: 'center',
              backgroundColor: isAdd ? tokens.primary : 'transparent',
              borderRadius: isAdd ? 13 : 10,
              height: isAdd ? 50 : 46,
              justifyContent: 'center',
              width: isAdd ? 54 : 52,
            }}
            testID={`housegains.dock.arcade.${tab.id}`}
          >
            <Ionicons
              color={isAdd ? tokens.onPrimary : selected ? tokens.primary : tokens.muted}
              name={tab.icon}
              size={isAdd ? 28 : 21}
            />
            {!isAdd ? (
              <Label style={{ color: selected ? tokens.primary : tokens.muted, fontSize: 10 }}>
                {t(`housegains.screens.tabs.${tab.key}`)}
              </Label>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function ArcadeDashboard(props: DashboardProps) {
  const { tokens } = useAppearance();
  const { t, locale } = useHouseGainsTranslation();
  const summary = deriveDashboardSummary(
    props.instances,
    props.members,
    props.weeklyTotals,
    props.currentMember.id,
  );
  const progression = deriveProgression(props.totalXp, props.currentMember);
  const weeklyGoal = deriveWeeklyGoal(summary.weeklyPoints, props.weeklyGoalXp);
  const completionRatio = weeklyGoal.ratio;
  const completedToday = summary.orderedInstances.reduce(
    (count, instance) => count + instance.completions.length,
    0,
  );
  const allToday = summary.orderedInstances.reduce(
    (count, instance) => count + instance.subtasks.length,
    0,
  );

  return (
    <View style={{ flex: 1, width: '100%' }}>
      <ScrollView contentContainerStyle={{ gap: 16, padding: 16, paddingBottom: 12 }}>
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: 12 }}>
          <MemberBadge
            accessibilityLabel={props.currentMember.name}
            color={props.currentMember.color}
            initials={props.currentMember.initials}
            size={48}
          />
          <View style={{ flex: 1 }}>
            <Label
              style={{ color: tokens.text, fontFamily: tokens.typography.bold, fontWeight: '800' }}
            >
              {props.currentMember.name}
            </Label>
            <Label
              style={{ color: tokens.muted, fontFamily: tokens.typography.mono, letterSpacing: 1 }}
            >
              {t('housegains.screens.dashboard.levelTitle', {
                level: progression.level,
                title: t(`housegains.screens.dashboard.title.${progression.titleKey}`),
              })}
            </Label>
          </View>
          <View
            style={{
              alignItems: 'center',
              backgroundColor: '#30221a',
              borderColor: tokens.accent,
              borderRadius: 10,
              borderWidth: 1,
              flexDirection: 'row',
              gap: 5,
              paddingHorizontal: 11,
              paddingVertical: 8,
            }}
          >
            <Ionicons color={tokens.accent} name="flame" size={16} />
            <Label
              style={{
                color: tokens.accent,
                fontFamily: tokens.typography.mono,
                fontWeight: '800',
              }}
            >
              {t('housegains.screens.dashboard.streakDays', { count: props.streak })}
            </Label>
          </View>
        </View>

        {props.ganhosChip}

        <Card
          style={{ backgroundColor: tokens.surface, borderColor: '#303740', gap: 10, padding: 18 }}
        >
          <Label
            style={{ color: tokens.muted, fontFamily: tokens.typography.mono, letterSpacing: 1.3 }}
          >
            {t('housegains.screens.dashboard.thisWeek')}
          </Label>
          {weeklyGoal.goal === null ? (
            <Label variant="caption">{t('housegains.screens.dashboard.goalNotSet')}</Label>
          ) : null}
          <View style={{ alignItems: 'baseline', flexDirection: 'row', gap: 8 }}>
            <Label
              style={{
                color: tokens.primary,
                fontFamily: tokens.typography.bold,
                fontSize: 54,
                fontWeight: '900',
                lineHeight: 58,
              }}
            >
              {summary.weeklyPoints}
            </Label>
            <Label
              style={{ color: tokens.muted, fontFamily: tokens.typography.mono, fontWeight: '800' }}
            >
              {t('housegains.screens.common.points')}
            </Label>
            <View style={{ flex: 1 }} />
            <Label
              style={{
                color: tokens.text,
                fontFamily: tokens.typography.mono,
                fontSize: 18,
                fontWeight: '800',
              }}
            >
              #{summary.rank}
            </Label>
          </View>
          <View
            accessibilityLabel={t('housegains.screens.dashboard.weeklyGoal')}
            style={{ flexDirection: 'row', gap: 4 }}
          >
            {Array.from({ length: 10 }, (_, index) => (
              <View
                key={index}
                style={{
                  backgroundColor: index < completionRatio * 10 ? tokens.primary : '#323840',
                  borderRadius: 3,
                  flex: 1,
                  height: 8,
                }}
              />
            ))}
          </View>
          <Label
            style={{
              backgroundColor: '#0B0E11',
              borderRadius: 10,
              color: tokens.muted,
              padding: 11,
            }}
          >
            {leaderMessage(summary, t)}
          </Label>
        </Card>

        <View
          style={{ alignItems: 'baseline', flexDirection: 'row', justifyContent: 'space-between' }}
        >
          <Label variant="heading">{t('housegains.screens.dashboard.todayQuests')}</Label>
          <Label variant="caption">
            {t('housegains.screens.dashboard.doneCount', { done: completedToday, total: allToday })}
          </Label>
        </View>

        {summary.orderedInstances.length === 0 ? (
          <Card style={{ alignItems: 'flex-start', gap: 12 }}>
            <Label variant="heading">{t('housegains.screens.dashboard.emptyTitle')}</Label>
            <Label>{t('housegains.screens.dashboard.emptyBody')}</Label>
            <Button
              onPress={() => props.onNavigate('add')}
              title={t('housegains.screens.dashboard.addFirstChore')}
              variant="outline"
            />
          </Card>
        ) : (
          summary.orderedInstances.map((instance) => {
            const chore = resolveInstanceChore(instance, props.chores);
            if (!chore) return null;
            const progress = instance.completions.length;
            const assignedMembers = instance.assigneeIds
              .map((id) => props.members.find((member) => member.id === id)?.name)
              .filter((name): name is string => Boolean(name));
            const title = choreDisplayName(chore, t);
            return (
              <Pressable
                accessibilityLabel={t('housegains.screens.dashboard.openChore', { name: title })}
                accessibilityRole="button"
                key={instance.id}
                onPress={() => props.onOpenInstance(instance.id)}
                testID={`housegains.dashboard.chore.${instance.id}`}
              >
                <Card
                  style={{
                    backgroundColor: tokens.surface,
                    borderColor: tokens.border,
                    gap: 9,
                    padding: 14,
                  }}
                >
                  <View style={{ alignItems: 'center', flexDirection: 'row', gap: 10 }}>
                    <View
                      style={{
                        alignItems: 'center',
                        backgroundColor: '#26341b',
                        borderRadius: 11,
                        height: 42,
                        justifyContent: 'center',
                        width: 42,
                      }}
                    >
                      <HouseGainsGlyph color={tokens.primary} icon={chore.icon} size={21} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Label
                        style={{
                          color: tokens.text,
                          fontFamily: tokens.typography.bold,
                          fontWeight: '800',
                        }}
                      >
                        {title}
                      </Label>
                      <Label variant="caption">
                        {assignedMembers.length === 0
                          ? t('housegains.screens.dashboard.unassigned')
                          : assignedMembers.length > 1
                            ? t('housegains.screens.dashboard.sharedBy', {
                                members: assignedMembers.join(', '),
                              })
                            : assignedMembers[0] === props.currentMember.name
                              ? t('housegains.screens.dashboard.yours')
                              : t('housegains.screens.dashboard.assignedTo', {
                                  member: assignedMembers[0],
                                })}
                      </Label>
                    </View>
                    <Label
                      style={{
                        color: tokens.primary,
                        fontFamily: tokens.typography.mono,
                        fontWeight: '800',
                      }}
                    >
                      {t('housegains.screens.dashboard.doneCount', {
                        done: progress,
                        total: instance.subtasks.length,
                      })}
                    </Label>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    <Label variant="caption">
                      {t('housegains.screens.choreDetail.dueAt', {
                        dateTime: new Intl.DateTimeFormat(locale, {
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZone: props.household.timeZone,
                        }).format(new Date(instance.dueAt)),
                      })}
                    </Label>
                    {instance.bonusXp > 0 &&
                    instance.completions.length < instance.subtasks.length &&
                    Date.parse(instance.dueAt) > Date.now() ? (
                      <Label variant="caption">
                        {t('housegains.screens.catalogDetail.bonus', { xp: instance.bonusXp })}
                      </Label>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {instance.subtasks.map((subtask) => {
                      const completion = instance.completions.find(
                        ({ subtaskId }) => subtaskId === subtask.id,
                      );
                      const completer = completion
                        ? props.members.find(({ id }) => id === completion.memberId)
                        : undefined;
                      const subtaskTitle = subtaskDisplayName(subtask, t);
                      return (
                        <View
                          key={subtask.id}
                          style={{
                            backgroundColor: completion ? '#1b3023' : '#20262c',
                            borderColor: completion ? tokens.success : '#37404a',
                            borderRadius: 8,
                            borderWidth: 1,
                            paddingHorizontal: 9,
                            paddingVertical: 7,
                          }}
                        >
                          <Label
                            style={{
                              color: completion ? tokens.success : tokens.muted,
                              fontSize: 12,
                            }}
                          >
                            {completion
                              ? t('housegains.screens.dashboard.completedSegment', {
                                  task: subtaskTitle,
                                  member: completer?.initials ?? '',
                                  xp: subtask.xp,
                                })
                              : t('housegains.screens.dashboard.openSegment', {
                                  task: subtaskTitle,
                                  xp: subtask.xp,
                                })}
                          </Label>
                        </View>
                      );
                    })}
                  </View>
                </Card>
              </Pressable>
            );
          })
        )}
      </ScrollView>
      <ArcadeDock active="today" onNavigate={props.onNavigate} />
    </View>
  );
}

function leaderMessage(
  summary: ReturnType<typeof deriveDashboardSummary>,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  if (!summary.leader) return t('housegains.screens.dashboard.noLeaderboardYet');
  if (summary.pointsToOvertake === 0) {
    return t('housegains.screens.dashboard.leadingBy', {
      member: summary.leader.name,
      points: summary.weeklyPoints - summary.leader.points,
    });
  }
  if (summary.weeklyPoints === summary.leader.points) {
    return t('housegains.screens.dashboard.tiedForLead', {
      member: summary.leader.name,
      points: summary.pointsToOvertake,
    });
  }
  return t('housegains.screens.dashboard.behindLeader', {
    member: summary.leader.name,
    lead: summary.leader.points - summary.weeklyPoints,
    points: summary.pointsToOvertake,
  });
}

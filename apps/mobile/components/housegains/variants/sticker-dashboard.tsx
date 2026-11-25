import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, View } from 'react-native';
import { Button, Card, Label } from '@/components/housegains/ui';
import { useAppearance } from '@/features/appearance';
import { MemberBadge } from '@/features/housegains-screens/screen-elements';
import {
  deriveDashboardSummary,
  deriveWeeklyGoal,
  resolveInstanceChore,
  choreDisplayName,
  subtaskDisplayName,
} from '@/features/housegains-screens/screen-model';
import { useHouseGainsTranslation } from '@/localization/housegains';
import type { AppTab, DashboardProps } from '@/features/housegains-screens/screen-types';
import type { ComponentProps } from 'react';

export function StickerDock({
  active,
  onNavigate,
}: {
  active: AppTab;
  onNavigate(tab: AppTab): void;
}) {
  const { tokens } = useAppearance();
  const { t, locale } = useHouseGainsTranslation();
  const tabs: {
    id: AppTab;
    icon: ComponentProps<typeof Ionicons>['name'];
    key: string;
  }[] = [
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
        borderWidth: 2,
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginHorizontal: 14,
        marginTop: 8,
        paddingHorizontal: 2,
        paddingVertical: 5,
        shadowColor: tokens.shadow.color,
        shadowOffset: tokens.shadow.offset,
        shadowOpacity: tokens.shadow.opacity,
        shadowRadius: tokens.shadow.radius,
        elevation: tokens.shadow.elevation,
      }}
      testID="housegains.dock.sticker"
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
              backgroundColor: isAdd ? tokens.accent : 'transparent',
              borderColor: isAdd ? tokens.border : 'transparent',
              borderRadius: isAdd ? 15 : 11,
              borderWidth: isAdd ? 2 : 0,
              height: isAdd ? 53 : 46,
              justifyContent: 'center',
              marginTop: isAdd ? -16 : 0,
              width: isAdd ? 56 : 52,
              shadowColor: isAdd ? tokens.shadow.color : 'transparent',
              shadowOffset: isAdd ? tokens.shadow.offset : { width: 0, height: 0 },
              shadowOpacity: isAdd ? tokens.shadow.opacity : 0,
              shadowRadius: isAdd ? tokens.shadow.radius : 0,
              elevation: isAdd ? tokens.shadow.elevation : 0,
            }}
            testID={`housegains.dock.sticker.${tab.id}`}
          >
            <Ionicons
              color={isAdd ? tokens.text : selected ? tokens.primary : tokens.text}
              name={tab.icon}
              size={isAdd ? 29 : 21}
            />
            {!isAdd ? (
              <Label
                style={{
                  color: selected ? tokens.primary : tokens.text,
                  fontSize: 10,
                  fontWeight: '800',
                }}
              >
                {t(`housegains.screens.tabs.${tab.key}`)}
              </Label>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function StickerDashboard(props: DashboardProps) {
  const { tokens } = useAppearance();
  const { t, locale } = useHouseGainsTranslation();
  const summary = deriveDashboardSummary(
    props.instances,
    props.members,
    props.weeklyTotals,
    props.currentMember.id,
  );
  const weeklyGoal = deriveWeeklyGoal(summary.weeklyPoints, props.weeklyGoalXp);
  const progressRatio = weeklyGoal.ratio;

  return (
    <View style={{ flex: 1, width: '100%' }}>
      <ScrollView contentContainerStyle={{ gap: 16, padding: 16, paddingBottom: 12 }}>
        <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'space-between' }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Label variant="caption" style={{ color: tokens.text, fontWeight: '700' }}>
              {props.household.name}
            </Label>
            <Label
              style={{
                fontFamily: tokens.typography.heading,
                fontSize: 31,
                fontWeight: '900',
                lineHeight: 38,
              }}
            >
              {t('housegains.screens.dashboard.greeting', { name: props.currentMember.name })}
            </Label>
          </View>
          <View
            style={{
              alignItems: 'center',
              alignSelf: 'flex-start',
              backgroundColor: tokens.accent,
              borderColor: tokens.border,
              borderRadius: 15,
              borderWidth: 2,
              flexDirection: 'row',
              gap: 5,
              paddingHorizontal: 11,
              paddingVertical: 9,
              shadowColor: tokens.shadow.color,
              shadowOffset: tokens.shadow.offset,
              shadowOpacity: tokens.shadow.opacity,
              shadowRadius: tokens.shadow.radius,
              elevation: tokens.shadow.elevation,
              transform: [{ rotate: '4deg' }],
            }}
          >
            <Ionicons color={tokens.text} name="flame" size={16} />
            <Label style={{ color: tokens.text, fontWeight: '900' }}>
              {t('housegains.screens.dashboard.streakDays', { count: props.streak })}
            </Label>
          </View>
        </View>

        {props.ganhosChip}
        {props.ratingBanner}

        <View style={{ marginRight: 4 }}>
          <Card
            style={{
              backgroundColor: tokens.primary,
              borderColor: tokens.border,
              gap: 8,
              minHeight: 164,
              padding: 18,
            }}
          >
            <Label style={{ color: tokens.onPrimary, fontWeight: '800' }}>
              {t('housegains.screens.dashboard.pointsThisWeek')}
            </Label>
            {weeklyGoal.goal === null ? (
              <Label variant="caption" style={{ color: tokens.onPrimary }}>
                {t('housegains.screens.dashboard.goalNotSet')}
              </Label>
            ) : null}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Label
                style={{
                  color: tokens.onPrimary,
                  fontFamily: tokens.typography.bold,
                  fontSize: 52,
                  fontWeight: '900',
                  lineHeight: 60,
                }}
              >
                {summary.weeklyPoints}
              </Label>
              <View
                style={{
                  alignItems: 'center',
                  backgroundColor: tokens.success,
                  borderColor: tokens.border,
                  borderRadius: 40,
                  borderWidth: 2,
                  height: 72,
                  justifyContent: 'center',
                  marginRight: 4,
                  marginTop: -26,
                  transform: [{ rotate: '8deg' }],
                  width: 72,
                }}
              >
                <Label style={{ color: tokens.text, fontSize: 11, fontWeight: '700' }}>
                  {t('housegains.screens.dashboard.rank')}
                </Label>
                <Label
                  style={{ color: tokens.text, fontSize: 25, fontWeight: '900', lineHeight: 27 }}
                >
                  #{summary.rank}
                </Label>
              </View>
            </View>
            <View
              style={{
                backgroundColor: tokens.surface,
                borderColor: tokens.border,
                borderRadius: 99,
                borderWidth: 2,
                height: 16,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  backgroundColor: tokens.accent,
                  height: '100%',
                  width: `${Math.min(progressRatio, 1) * 100}%`,
                }}
              />
            </View>
            <Label style={{ color: tokens.onPrimary, fontSize: 13, fontWeight: '700' }}>
              {!summary.leader
                ? t('housegains.screens.dashboard.noLeaderboardYet')
                : summary.pointsToOvertake === 0
                  ? t('housegains.screens.dashboard.leadingBy', {
                      member: summary.leader.name,
                      points: summary.weeklyPoints - summary.leader.points,
                    })
                  : summary.weeklyPoints === summary.leader.points
                    ? t('housegains.screens.dashboard.tiedForLead', {
                        member: summary.leader.name,
                        points: summary.pointsToOvertake,
                      })
                    : t('housegains.screens.dashboard.behindLeader', {
                        member: summary.leader.name,
                        lead: summary.leader.points - summary.weeklyPoints,
                        points: summary.pointsToOvertake,
                      })}
            </Label>
          </Card>
        </View>

        <View
          style={{ alignItems: 'baseline', flexDirection: 'row', justifyContent: 'space-between' }}
        >
          <Label variant="heading">{t('housegains.screens.dashboard.todaysChores')}</Label>
          <Label variant="caption">
            {t('housegains.screens.dashboard.doneCount', {
              done: summary.completedSubtasks,
              total: summary.totalSubtasks,
            })}
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
            const title = choreDisplayName(chore, t);
            const completed = new Set(instance.completions.map(({ subtaskId }) => subtaskId));
            const isUnassigned = instance.assigneeIds.length === 0;
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
                    backgroundColor: isUnassigned ? '#FFF1C4' : tokens.surface,
                    borderColor: tokens.border,
                    borderStyle: isUnassigned ? 'dashed' : 'solid',
                    gap: 10,
                    padding: 13,
                  }}
                >
                  <View style={{ alignItems: 'center', flexDirection: 'row', gap: 10 }}>
                    <MemberBadge
                      accessibilityLabel={chore.icon}
                      color={isUnassigned ? tokens.accent : props.currentMember.color}
                      initials={isUnassigned ? '?' : chore.icon}
                      size={40}
                    />
                    <View style={{ flex: 1 }}>
                      <Label style={{ fontFamily: tokens.typography.bold, fontWeight: '900' }}>
                        {title}
                      </Label>
                      <Label variant="caption">
                        {isUnassigned
                          ? t('housegains.screens.dashboard.upForGrabs')
                          : instance.assigneeIds.length > 1
                            ? t('housegains.screens.dashboard.sharedBy', {
                                members: instance.assigneeIds
                                  .map(
                                    (id) => props.members.find((member) => member.id === id)?.name,
                                  )
                                  .filter(Boolean)
                                  .join(', '),
                              })
                            : t('housegains.screens.dashboard.yours')}
                      </Label>
                    </View>
                    <Label
                      style={{
                        backgroundColor: tokens.accent,
                        borderRadius: 99,
                        color: tokens.text,
                        fontWeight: '900',
                        paddingHorizontal: 9,
                        paddingVertical: 5,
                      }}
                    >
                      {t('housegains.screens.dashboard.remainingXp', {
                        xp: instance.subtasks
                          .filter(({ id }) => !completed.has(id))
                          .reduce((total, { xp }) => total + xp, 0),
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
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                    {instance.subtasks.map((subtask) => {
                      const completion = instance.completions.find(
                        ({ subtaskId }) => subtaskId === subtask.id,
                      );
                      const member = completion
                        ? props.members.find(({ id }) => id === completion.memberId)
                        : undefined;
                      const subtaskTitle = subtaskDisplayName(subtask, t);
                      return (
                        <View
                          key={subtask.id}
                          style={{
                            alignItems: 'center',
                            backgroundColor: completion ? tokens.success : tokens.surface,
                            borderColor: tokens.border,
                            borderRadius: 999,
                            borderWidth: 2,
                            flexDirection: 'row',
                            gap: 5,
                            paddingHorizontal: 9,
                            paddingVertical: 6,
                          }}
                        >
                          {completion ? (
                            <Ionicons color={tokens.text} name="checkmark-circle" size={16} />
                          ) : null}
                          <Label style={{ color: tokens.text, fontSize: 12, fontWeight: '800' }}>
                            {completion
                              ? t('housegains.screens.dashboard.completedSegment', {
                                  task: subtaskTitle,
                                  member: member?.initials ?? '',
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
      <StickerDock active="today" onNavigate={props.onNavigate} />
    </View>
  );
}

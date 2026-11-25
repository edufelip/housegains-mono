import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, View } from 'react-native';
import { Circle, Svg } from 'react-native-svg';
import { Button, Card, Label } from '@/components/housegains/ui';
import { useAppearance } from '@/features/appearance';
import { HouseGainsGlyph, MemberBadge } from '@/features/housegains-screens/screen-elements';
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

export function SoftDock({
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
        backgroundColor: '#241E37',
        borderRadius: 999,
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginHorizontal: 18,
        marginTop: 8,
        padding: 7,
      }}
      testID="housegains.dock.soft"
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
              backgroundColor: isAdd ? tokens.primary : selected ? '#FFFFFF' : 'transparent',
              borderRadius: 999,
              height: 45,
              justifyContent: 'center',
              width: 48,
            }}
            testID={`housegains.dock.soft.${tab.id}`}
          >
            <Ionicons
              color={isAdd ? tokens.onPrimary : selected ? '#241E37' : '#D6D0E4'}
              name={tab.icon}
              size={isAdd ? 26 : 21}
            />
            {!isAdd && !selected ? (
              <Label style={{ color: '#D6D0E4', fontSize: 9 }}>
                {t(`housegains.screens.tabs.${tab.key}`)}
              </Label>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function SoftProgressRing({
  progress,
  done,
  total,
  color,
  trackColor,
}: {
  progress: number;
  done: number;
  total: number | null;
  color: string;
  trackColor: string;
}) {
  const { t } = useHouseGainsTranslation();
  const { tokens } = useAppearance();
  const radius = 39;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - Math.min(progress, 1));
  return (
    <View style={{ alignItems: 'center', height: 100, justifyContent: 'center', width: 100 }}>
      <Svg height={100} width={100}>
        <Circle cx={50} cy={50} fill="none" r={radius} stroke={trackColor} strokeWidth={9} />
        <Circle
          cx={50}
          cy={50}
          fill="none"
          r={radius}
          stroke={color}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          strokeWidth={9}
          transform="rotate(-90 50 50)"
        />
      </Svg>
      <View style={{ alignItems: 'center', position: 'absolute' }}>
        <Label
          style={{
            color: '#241E37',
            fontFamily: tokens.typography.heading,
            fontSize: 23,
            fontWeight: '700',
          }}
        >
          {done}
        </Label>
        <Label variant="caption" style={{ color: '#5D566F', fontSize: 10 }}>
          {total === null
            ? t('housegains.screens.dashboard.goalNotSet')
            : t('housegains.screens.dashboard.ofGoal', { goal: total })}
        </Label>
      </View>
    </View>
  );
}

export function SoftDashboard(props: DashboardProps) {
  const { tokens } = useAppearance();
  const { t, locale } = useHouseGainsTranslation();
  const summary = deriveDashboardSummary(
    props.instances,
    props.members,
    props.weeklyTotals,
    props.currentMember.id,
  );
  const weeklyGoal = deriveWeeklyGoal(summary.weeklyPoints, props.weeklyGoalXp);
  const progress = weeklyGoal.ratio;
  const weekday = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: props.household.timeZone,
  }).format(new Date());

  return (
    <View style={{ flex: 1, width: '100%' }}>
      <ScrollView contentContainerStyle={{ gap: 18, padding: 18, paddingBottom: 14 }}>
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1, gap: 3 }}>
            <Label variant="caption" style={{ color: tokens.muted, textTransform: 'capitalize' }}>
              {weekday}
            </Label>
            <Label style={{ fontFamily: tokens.typography.heading, fontSize: 30, lineHeight: 37 }}>
              {t('housegains.screens.dashboard.softGreeting', { name: props.currentMember.name })}
            </Label>
          </View>
          <MemberBadge
            accessibilityLabel={props.currentMember.name}
            color={props.currentMember.color}
            initials={props.currentMember.initials}
            size={46}
          />
        </View>

        {props.ganhosChip}
        {props.ratingBanner}

        <Card
          style={{
            alignItems: 'center',
            borderWidth: 0,
            flexDirection: 'row',
            gap: 12,
            padding: 16,
          }}
        >
          <SoftProgressRing
            color={tokens.primary}
            done={summary.weeklyPoints}
            progress={progress}
            total={weeklyGoal.goal}
            trackColor="#EAE5F5"
          />
          <View style={{ flex: 1, gap: 8 }}>
            <Label variant="heading" style={{ fontFamily: tokens.typography.heading }}>
              {t('housegains.screens.dashboard.weeklyGoal')}
            </Label>
            <Label variant="caption">
              {weeklyGoal.percent === null
                ? t('housegains.screens.dashboard.goalNotSet')
                : t('housegains.screens.dashboard.percentThere', { percent: weeklyGoal.percent })}
            </Label>
            <View
              style={{
                alignSelf: 'flex-start',
                backgroundColor: '#FFF0D5',
                borderRadius: 999,
                flexDirection: 'row',
                gap: 5,
                paddingHorizontal: 10,
                paddingVertical: 7,
              }}
            >
              <Ionicons color="#B86B36" name="flame" size={15} />
              <Label style={{ color: '#714821', fontSize: 13, fontWeight: '700' }}>
                {t('housegains.screens.dashboard.streakDays', { count: props.streak })}
              </Label>
            </View>
          </View>
        </Card>

        <ScrollView
          horizontal
          contentContainerStyle={{ gap: 8 }}
          showsHorizontalScrollIndicator={false}
        >
          {props.members
            .map((member) => ({ member, points: props.weeklyTotals[member.id] ?? 0 }))
            .sort((left, right) => right.points - left.points)
            .map(({ member, points }) => {
              const isCurrent = member.id === props.currentMember.id;
              return (
                <View
                  key={member.id}
                  style={{
                    alignItems: 'center',
                    backgroundColor: isCurrent ? '#ECE9FF' : tokens.surface,
                    borderColor: isCurrent ? tokens.primary : 'transparent',
                    borderRadius: 17,
                    borderWidth: isCurrent ? 1.5 : 0,
                    minWidth: 82,
                    paddingHorizontal: 13,
                    paddingVertical: 9,
                  }}
                >
                  <Label
                    style={{
                      color: tokens.text,
                      fontSize: 13,
                      fontWeight: isCurrent ? '700' : '500',
                    }}
                  >
                    {isCurrent ? t('housegains.screens.dashboard.you') : member.name}
                  </Label>
                  <Label style={{ color: tokens.muted, fontSize: 12 }}>{points}</Label>
                </View>
              );
            })}
        </ScrollView>

        <View
          style={{ alignItems: 'baseline', flexDirection: 'row', justifyContent: 'space-between' }}
        >
          <Label variant="heading" style={{ fontFamily: tokens.typography.heading }}>
            {t('housegains.screens.dashboard.yourTurnToday')}
          </Label>
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
            return (
              <Pressable
                accessibilityLabel={t('housegains.screens.dashboard.openChore', { name: title })}
                accessibilityRole="button"
                key={instance.id}
                onPress={() => props.onOpenInstance(instance.id)}
                style={({ pressed }) => ({ opacity: pressed ? 0.82 : 1 })}
                testID={`housegains.dashboard.chore.${instance.id}`}
              >
                <Card style={{ borderColor: 'transparent', borderWidth: 0, gap: 10, padding: 14 }}>
                  <View style={{ alignItems: 'center', flexDirection: 'row', gap: 10 }}>
                    <View
                      style={{
                        alignItems: 'center',
                        backgroundColor: '#F1EDF9',
                        borderRadius: 14,
                        height: 42,
                        justifyContent: 'center',
                        width: 42,
                      }}
                    >
                      <HouseGainsGlyph color={tokens.text} icon={chore.icon} size={20} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Label style={{ fontFamily: tokens.typography.medium, fontWeight: '700' }}>
                        {title}
                      </Label>
                      <Label variant="caption">
                        {instance.assigneeIds.length === 0
                          ? t('housegains.screens.dashboard.unassigned')
                          : instance.assigneeIds.length > 1
                            ? t('housegains.screens.dashboard.sharedBy', {
                                members: instance.assigneeIds
                                  .map(
                                    (id) => props.members.find((member) => member.id === id)?.name,
                                  )
                                  .filter(Boolean)
                                  .join(', '),
                              })
                            : instance.assigneeIds[0] === props.currentMember.id
                              ? t('housegains.screens.dashboard.yours')
                              : t('housegains.screens.dashboard.assignedTo', {
                                  member:
                                    props.members.find(({ id }) => id === instance.assigneeIds[0])
                                      ?.name ?? '',
                                })}
                      </Label>
                    </View>
                    <Label style={{ color: tokens.primary, fontWeight: '700' }}>
                      {t('housegains.screens.dashboard.remainingXp', {
                        xp: instance.subtasks
                          .filter(
                            ({ id }) => !instance.completions.some((item) => item.subtaskId === id),
                          )
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
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
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
                            backgroundColor: completion ? '#EAE5FF' : '#F6F4FA',
                            borderRadius: 8,
                            paddingHorizontal: 9,
                            paddingVertical: 6,
                          }}
                        >
                          <Label style={{ color: tokens.text, fontSize: 12 }}>
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
      <SoftDock active="today" onNavigate={props.onNavigate} />
    </View>
  );
}

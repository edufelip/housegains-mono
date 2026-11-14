import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { getThemeTokens, type ThemeId } from '@/features/appearance';
import { useHouseGainsTranslation } from '@/localization/housegains';
import type { ReactNode } from 'react';

type ThemePreviewProps = {
  themeId: ThemeId;
  style?: StyleProp<ViewStyle>;
};

function MiniText({
  children,
  style,
  lines = 1,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  lines?: number;
}) {
  return (
    <Text allowFontScaling={false} numberOfLines={lines} style={style}>
      {children}
    </Text>
  );
}

function ArcadePreview() {
  const tokens = getThemeTokens('arcade');
  const { t } = useHouseGainsTranslation();
  return (
    <View style={[styles.preview, { backgroundColor: tokens.canvas, padding: 13 }]}>
      <View style={styles.headerRow}>
        <View style={[styles.arcadeAvatar, { backgroundColor: tokens.primary }]}>
          <MiniText style={[styles.initials, { color: tokens.onPrimary }]}>
            {t('housegains.preview.member_initials')}
          </MiniText>
        </View>
        <View style={styles.flexOne}>
          <MiniText style={[styles.memberName, { color: tokens.text }]}>
            {t('housegains.preview.member_name')}
          </MiniText>
          <MiniText style={[styles.level, { color: tokens.muted }]}>
            {t('housegains.preview.level')}
          </MiniText>
        </View>
        <View style={[styles.arcadeStreak, { borderColor: tokens.accent }]}>
          <MiniText style={[styles.streakGlyph, { color: tokens.accent }]}>🔥</MiniText>
          <MiniText style={[styles.streakText, { color: tokens.text }]}>
            {t('housegains.preview.streak')}
          </MiniText>
        </View>
      </View>

      <View
        style={[
          styles.arcadeScore,
          { backgroundColor: tokens.surface, borderColor: tokens.border },
        ]}
      >
        <MiniText style={[styles.overline, { color: tokens.muted }]}>
          {t('housegains.preview.week')}
        </MiniText>
        <View style={styles.scoreLine}>
          <MiniText style={[styles.arcadeNumber, { color: tokens.primary }]}>320</MiniText>
          <MiniText style={[styles.scoreUnit, { color: tokens.muted }]}>
            {t('housegains.preview.points_unit')}
          </MiniText>
        </View>
        <View style={styles.progressSegments}>
          {Array.from({ length: 10 }, (_, index) => (
            <View
              key={index}
              style={{
                flex: 1,
                height: 7,
                borderRadius: 4,
                marginRight: index === 9 ? 0 : 3,
                backgroundColor: index < 8 ? tokens.primary : '#30363D',
              }}
            />
          ))}
        </View>
        <View style={[styles.arcadeCallout, { backgroundColor: '#090C10' }]}>
          <MiniText style={[styles.rankNumber, { color: tokens.text }]}>#2</MiniText>
          <MiniText lines={2} style={[styles.calloutText, { color: tokens.text }]}>
            {t('housegains.preview.arcade_delta', {
              member: t('housegains.preview.member_rafa'),
              lead: 45,
              pointsToPass: 46,
            })}
          </MiniText>
        </View>
      </View>

      <View style={styles.sectionHeading}>
        <MiniText style={[styles.sectionTitle, { color: tokens.text }]}>
          {t('housegains.preview.arcade_tasks')}
        </MiniText>
        <MiniText style={[styles.count, { color: tokens.muted }]}>
          {t('housegains.preview.done_count', { done: 2, total: 5 })}
        </MiniText>
      </View>
      <View style={styles.taskStack}>
        <View
          style={[
            styles.arcadeTask,
            { borderColor: tokens.border, backgroundColor: tokens.surface },
          ]}
        >
          <View style={[styles.check, { backgroundColor: tokens.success }]}>
            <MiniText style={[styles.checkGlyph, { color: tokens.onPrimary }]}>✓</MiniText>
          </View>
          <View style={styles.flexOne}>
            <MiniText style={[styles.taskName, styles.struck, { color: tokens.muted }]}>
              {t('housegains.preview.task_recycling')}
            </MiniText>
            <MiniText style={[styles.taskSub, { color: tokens.muted }]}>
              {t('housegains.preview.task_done_time')}
            </MiniText>
          </View>
          <MiniText style={[styles.xp, { color: tokens.primary }]}>+15</MiniText>
        </View>
        <View
          style={[
            styles.arcadeTask,
            styles.activeQuest,
            { borderColor: tokens.primary, backgroundColor: tokens.surface },
          ]}
        >
          <View style={[styles.emptyCheck, { borderColor: '#586270' }]} />
          <View style={styles.flexOne}>
            <MiniText style={[styles.taskName, { color: tokens.text }]}>
              {t('housegains.preview.task_dishes')}
            </MiniText>
            <MiniText style={[styles.taskSub, { color: tokens.muted }]}>
              {t('housegains.preview.task_dishes_hint')}
            </MiniText>
          </View>
          <View style={[styles.xpBadge, { backgroundColor: tokens.primary }]}>
            <MiniText style={[styles.xpBadgeText, { color: tokens.onPrimary }]}>+20</MiniText>
          </View>
        </View>
      </View>
      <MiniDock themeId="arcade" />
    </View>
  );
}

function StickerPreview() {
  const tokens = getThemeTokens('sticker');
  const { t } = useHouseGainsTranslation();
  return (
    <View style={[styles.preview, { backgroundColor: tokens.canvas, padding: 13 }]}>
      <View style={styles.stickerHeader}>
        <View style={styles.flexOne}>
          <MiniText style={[styles.houseName, { color: tokens.text }]}>
            {t('housegains.preview.home_name')}
          </MiniText>
          <MiniText style={[styles.stickerGreeting, { color: tokens.text }]}>
            {t('housegains.preview.sticker_greeting', {
              name: t('housegains.preview.member_name'),
            })}
          </MiniText>
        </View>
        <View
          style={[
            styles.streakSticker,
            { backgroundColor: tokens.accent, borderColor: tokens.border },
          ]}
        >
          <MiniText style={[styles.stickerStreak, { color: tokens.text }]}>
            🔥 {t('housegains.preview.streak')}
          </MiniText>
        </View>
      </View>

      <View style={styles.hardShadowWrap}>
        <View style={[styles.hardShadow, { backgroundColor: tokens.border, borderRadius: 18 }]} />
        <View
          style={[styles.stickerScore, { backgroundColor: '#3D58F4', borderColor: tokens.border }]}
        >
          <MiniText style={styles.pointsWhite}>{t('housegains.preview.points')}</MiniText>
          <MiniText style={styles.stickerNumber}>320</MiniText>
          <View style={styles.stickerProgressOuter}>
            <View style={[styles.stickerProgress, { backgroundColor: tokens.accent }]} />
          </View>
          <MiniText lines={2} style={styles.stickerDelta}>
            {t('housegains.preview.sticker_delta', {
              member: t('housegains.preview.member_rafa'),
              pointsToPass: 46,
            })}
          </MiniText>
        </View>
        <View
          style={[
            styles.rankSticker,
            { backgroundColor: tokens.success, borderColor: tokens.border },
          ]}
        >
          <MiniText style={[styles.rankStickerLabel, { color: tokens.text }]}>
            {t('housegains.preview.rank')}
          </MiniText>
          <MiniText style={[styles.rankStickerValue, { color: tokens.text }]}>#2</MiniText>
        </View>
      </View>

      <View style={styles.sectionHeading}>
        <MiniText style={[styles.stickerTaskHeading, { color: tokens.text }]}>
          {t('housegains.preview.sticker_tasks')}
        </MiniText>
        <MiniText style={[styles.count, { color: tokens.text }]}>
          {t('housegains.preview.done_count', { done: 2, total: 5 })}
        </MiniText>
      </View>
      <View style={styles.taskStack}>
        <View
          style={[
            styles.stickerTask,
            { backgroundColor: tokens.success, borderColor: tokens.border },
          ]}
        >
          <View style={[styles.stickerCheck, { backgroundColor: tokens.text }]}>
            <MiniText style={[styles.stickerCheckGlyph, { color: tokens.success }]}>✓</MiniText>
          </View>
          <MiniText
            lines={2}
            style={[styles.taskName, styles.struck, styles.flexOne, { color: tokens.text }]}
          >
            {t('housegains.preview.task_recycling')}
          </MiniText>
          <MiniText style={[styles.xp, { color: tokens.text }]}>+15</MiniText>
        </View>
        <View
          style={[
            styles.stickerTask,
            { backgroundColor: tokens.surface, borderColor: tokens.border },
          ]}
        >
          <View style={[styles.stickerEmpty, { borderColor: tokens.border }]} />
          <MiniText lines={2} style={[styles.taskName, styles.flexOne, { color: tokens.text }]}>
            {t('housegains.preview.task_dishes')}
          </MiniText>
          <View
            style={[
              styles.stickerXp,
              { backgroundColor: tokens.accent, borderColor: tokens.border },
            ]}
          >
            <MiniText style={[styles.stickerXpText, { color: tokens.text }]}>+20</MiniText>
          </View>
        </View>
      </View>
      <MiniDock themeId="sticker" />
    </View>
  );
}

function SoftPreview() {
  const tokens = getThemeTokens('soft');
  const { t } = useHouseGainsTranslation();
  const ringCircumference = 2 * Math.PI * 29;
  return (
    <View style={[styles.preview, { backgroundColor: tokens.canvas, padding: 13 }]}>
      <View style={styles.softHeader}>
        <View style={styles.flexOne}>
          <MiniText style={[styles.softGreeting, { color: tokens.text }]}>
            {t('housegains.preview.greeting')}
          </MiniText>
          <MiniText style={[styles.softName, { color: tokens.text }]}>
            {t('housegains.preview.member_name')}
          </MiniText>
        </View>
        <View style={[styles.softAvatar, { backgroundColor: '#FDE2D3' }]}>
          <MiniText style={[styles.softAvatarText, { color: '#9D4C2A' }]}>
            {t('housegains.preview.member_initials')}
          </MiniText>
        </View>
      </View>

      <View style={[styles.softScore, { backgroundColor: tokens.surface }]}>
        <View style={styles.ringWrap}>
          <Svg width={74} height={74} viewBox="0 0 74 74" accessibilityElementsHidden>
            <Circle cx="37" cy="37" r="29" fill="none" stroke="#E9E4F4" strokeWidth="8" />
            <Circle
              cx="37"
              cy="37"
              r="29"
              fill="none"
              stroke={tokens.primary}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${ringCircumference * 0.8} ${ringCircumference}`}
              transform="rotate(-90 37 37)"
            />
          </Svg>
          <View style={styles.ringCenter}>
            <MiniText style={[styles.softNumber, { color: tokens.text }]}>320</MiniText>
            <MiniText style={[styles.ringCaption, { color: tokens.muted }]}>
              {t('housegains.preview.points_fraction', { goal: 400 })}
            </MiniText>
          </View>
        </View>
        <View style={styles.softScoreDetails}>
          <MiniText style={[styles.softGoal, { color: tokens.muted }]}>
            {t('housegains.preview.goal')}
          </MiniText>
          <MiniText style={[styles.softGoalProgress, { color: tokens.text }]}>
            {t('housegains.preview.goal_progress', { percent: 80 })}
          </MiniText>
          <View style={[styles.softStreak, { backgroundColor: '#FFF0D2' }]}>
            <MiniText style={[styles.softStreakGlyph, { color: '#9D5E13' }]}>🔥</MiniText>
            <MiniText style={[styles.softStreakText, { color: '#704210' }]}>
              {t('housegains.preview.streak')}
            </MiniText>
          </View>
        </View>
      </View>

      <View style={styles.memberChips}>
        <MemberChip
          name={t('housegains.preview.member_rafa')}
          points={365}
          fill="#D9F1E5"
          tokens={tokens}
        />
        <MemberChip
          name={t('housegains.preview.you')}
          points={320}
          fill="#E7E3FF"
          active
          tokens={tokens}
        />
        <MemberChip
          name={t('housegains.preview.member_bia')}
          points={290}
          fill="#FCE1D3"
          tokens={tokens}
        />
        <MemberChip
          name={t('housegains.preview.member_thiago')}
          points={140}
          fill="#DDEAFF"
          tokens={tokens}
        />
      </View>

      <View style={styles.sectionHeading}>
        <MiniText style={[styles.softTaskHeading, { color: tokens.text }]}>
          {t('housegains.preview.soft_tasks')}
        </MiniText>
        <MiniText style={[styles.count, { color: tokens.muted }]}>
          {t('housegains.preview.done_count', { done: 2, total: 5 })}
        </MiniText>
      </View>
      <View style={styles.taskStack}>
        <View style={[styles.softTask, { backgroundColor: tokens.surface }]}>
          <View style={[styles.softCheck, { backgroundColor: tokens.primary }]}>
            <MiniText style={[styles.checkGlyph, { color: '#FFFFFF' }]}>✓</MiniText>
          </View>
          <MiniText
            lines={2}
            style={[styles.taskName, styles.struck, styles.flexOne, { color: tokens.muted }]}
          >
            {t('housegains.preview.task_recycling')}
          </MiniText>
          <MiniText style={[styles.xp, { color: tokens.muted }]}>+15</MiniText>
        </View>
        <View style={[styles.softTask, { backgroundColor: tokens.surface }]}>
          <View style={[styles.softEmpty, { borderColor: '#C8BFE3' }]} />
          <View style={styles.flexOne}>
            <MiniText lines={1} style={[styles.taskName, { color: tokens.text }]}>
              {t('housegains.preview.task_dishes')}
            </MiniText>
            <MiniText style={[styles.taskSub, { color: tokens.muted }]}>
              {t('housegains.preview.task_dishes_hint')}
            </MiniText>
          </View>
          <MiniText style={[styles.softXp, { color: tokens.primary, backgroundColor: '#EAE6FF' }]}>
            +20
          </MiniText>
        </View>
      </View>
      <MiniDock themeId="soft" />
    </View>
  );
}

function MemberChip({
  name,
  points,
  fill,
  active = false,
  tokens,
}: {
  name: string;
  points: number;
  fill: string;
  active?: boolean;
  tokens: ReturnType<typeof getThemeTokens>;
}) {
  return (
    <View
      style={[
        styles.memberChip,
        { backgroundColor: fill },
        active ? { borderColor: tokens.primary, borderWidth: 1.5 } : null,
      ]}
    >
      <MiniText style={[styles.memberChipName, { color: tokens.text }]}>{name}</MiniText>
      <MiniText style={[styles.memberChipPoints, { color: tokens.text }]}>{points}</MiniText>
    </View>
  );
}

function MiniDock({ themeId }: { themeId: ThemeId }) {
  const tokens = getThemeTokens(themeId);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.dock,
        themeId === 'arcade'
          ? { backgroundColor: '#10151C', borderColor: '#242B35' }
          : themeId === 'sticker'
            ? {
                backgroundColor: '#FFFFFF',
                borderColor: tokens.border,
                borderWidth: 2,
                borderRadius: 15,
              }
            : { backgroundColor: '#211A35', borderColor: '#211A35', borderRadius: 24 },
      ]}
    >
      {['⌂', '▧'].map((icon, index) => (
        <MiniText
          key={icon}
          style={[
            styles.dockGlyph,
            { color: index === 0 ? tokens.primary : tokens.muted },
            themeId === 'soft' ? { color: '#D8D1EA' } : null,
          ]}
        >
          {icon}
        </MiniText>
      ))}
      <View
        style={[
          styles.addDock,
          {
            backgroundColor:
              themeId === 'arcade'
                ? tokens.primary
                : themeId === 'sticker'
                  ? tokens.accent
                  : tokens.primary,
          },
          themeId === 'sticker'
            ? { borderColor: tokens.border, borderWidth: 2, transform: [{ translateY: -4 }] }
            : null,
        ]}
      >
        <MiniText style={[styles.addDockText, { color: tokens.onPrimary }]}>+</MiniText>
      </View>
      {['♜', '♙'].map((icon) => (
        <MiniText
          key={icon}
          style={[
            styles.dockGlyph,
            { color: tokens.muted },
            themeId === 'soft' ? { color: '#D8D1EA' } : null,
          ]}
        >
          {icon}
        </MiniText>
      ))}
    </View>
  );
}

export function ThemePreview({ themeId, style }: ThemePreviewProps) {
  const { t } = useHouseGainsTranslation();
  const Preview =
    themeId === 'arcade' ? ArcadePreview : themeId === 'sticker' ? StickerPreview : SoftPreview;
  return (
    <View
      accessible={false}
      testID={`housegains.theme-preview.${themeId}`}
      style={[styles.previewFrame, style]}
      accessibilityLabel={t('housegains.appearance.preview_hint')}
    >
      <Preview />
    </View>
  );
}

const styles = StyleSheet.create({
  previewFrame: {
    height: 270,
    overflow: 'hidden',
    borderRadius: 18,
  },
  preview: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 18,
    justifyContent: 'space-between',
  },
  flexOne: {
    flex: 1,
    minWidth: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  arcadeAvatar: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontSize: 10,
    fontFamily: 'Geist_700Bold',
  },
  memberName: {
    fontSize: 12,
    lineHeight: 15,
    fontFamily: 'Geist_700Bold',
  },
  level: {
    marginTop: 1,
    fontSize: 8,
    lineHeight: 11,
    fontFamily: 'Geist_500Medium',
  },
  arcadeStreak: {
    minHeight: 28,
    maxWidth: 122,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 7,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
  },
  streakGlyph: {
    fontSize: 10,
  },
  streakText: {
    fontSize: 9,
    lineHeight: 13,
    fontFamily: 'Geist_700Bold',
    flexShrink: 1,
  },
  arcadeScore: {
    borderRadius: 13,
    borderWidth: 1,
    padding: 10,
    gap: 3,
  },
  overline: {
    fontSize: 8,
    lineHeight: 10,
    fontFamily: 'Geist_700Bold',
    textTransform: 'uppercase',
  },
  scoreLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  arcadeNumber: {
    fontSize: 30,
    lineHeight: 34,
    fontFamily: 'Geist_700Bold',
    letterSpacing: -1.4,
  },
  scoreUnit: {
    fontSize: 9,
    fontFamily: 'Geist_700Bold',
  },
  progressSegments: {
    flexDirection: 'row',
  },
  arcadeCallout: {
    minHeight: 23,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rankNumber: {
    fontSize: 9,
    lineHeight: 13,
    fontFamily: 'Geist_700Bold',
  },
  calloutText: {
    flex: 1,
    fontSize: 8,
    lineHeight: 10,
    fontFamily: 'Geist_500Medium',
  },
  sectionHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontFamily: 'Geist_700Bold',
    flexShrink: 1,
  },
  count: {
    fontSize: 8,
    lineHeight: 11,
    fontFamily: 'Geist_700Bold',
  },
  taskStack: {
    gap: 4,
  },
  arcadeTask: {
    minHeight: 33,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderWidth: 1,
    borderRadius: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activeQuest: {
    borderWidth: 1.5,
  },
  check: {
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkGlyph: {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Geist_700Bold',
  },
  emptyCheck: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
  },
  taskName: {
    fontSize: 9,
    lineHeight: 12,
    fontFamily: 'Geist_700Bold',
  },
  taskSub: {
    fontSize: 7,
    lineHeight: 9,
    fontFamily: 'Geist_500Medium',
  },
  struck: {
    textDecorationLine: 'line-through',
  },
  xp: {
    fontSize: 9,
    lineHeight: 13,
    fontFamily: 'Geist_700Bold',
  },
  xpBadge: {
    minWidth: 31,
    paddingHorizontal: 5,
    paddingVertical: 3,
    alignItems: 'center',
    borderRadius: 6,
  },
  xpBadgeText: {
    fontSize: 9,
    lineHeight: 12,
    fontFamily: 'Geist_700Bold',
  },
  dock: {
    height: 30,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 9,
  },
  dockGlyph: {
    fontSize: 12,
    lineHeight: 16,
  },
  addDock: {
    width: 27,
    height: 27,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addDockText: {
    fontSize: 18,
    lineHeight: 21,
    fontFamily: 'Geist_500Medium',
  },
  stickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  houseName: {
    fontSize: 8,
    lineHeight: 11,
    fontFamily: 'Geist_700Bold',
  },
  stickerGreeting: {
    fontSize: 18,
    lineHeight: 21,
    fontFamily: 'Geist_700Bold',
    letterSpacing: -0.6,
  },
  streakSticker: {
    maxWidth: 120,
    minHeight: 29,
    borderWidth: 2,
    borderRadius: 11,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '4deg' }],
  },
  stickerStreak: {
    fontSize: 8,
    lineHeight: 11,
    fontFamily: 'Geist_700Bold',
    flexShrink: 1,
  },
  hardShadowWrap: {
    position: 'relative',
    height: 100,
    marginRight: 4,
    marginBottom: 3,
  },
  hardShadow: {
    ...StyleSheet.absoluteFillObject,
    transform: [{ translateX: 4 }, { translateY: 4 }],
  },
  stickerScore: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2.5,
    borderRadius: 18,
    padding: 8,
    justifyContent: 'space-between',
  },
  pointsWhite: {
    color: '#FFFFFF',
    fontSize: 9,
    lineHeight: 12,
    fontFamily: 'Geist_700Bold',
  },
  stickerNumber: {
    color: '#FFFFFF',
    fontSize: 30,
    lineHeight: 34,
    fontFamily: 'Geist_700Bold',
    letterSpacing: -1.1,
  },
  stickerProgressOuter: {
    height: 11,
    backgroundColor: '#FFFFFF',
    borderColor: '#111111',
    borderWidth: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  stickerProgress: {
    width: '80%',
    height: '100%',
  },
  stickerDelta: {
    color: '#FFFFFF',
    fontSize: 8,
    lineHeight: 10,
    fontFamily: 'Geist_700Bold',
    maxWidth: '88%',
  },
  rankSticker: {
    position: 'absolute',
    top: -10,
    right: 20,
    width: 41,
    height: 41,
    borderWidth: 2,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '8deg' }],
  },
  rankStickerLabel: {
    fontSize: 6,
    lineHeight: 8,
    fontFamily: 'Geist_700Bold',
  },
  rankStickerValue: {
    fontSize: 14,
    lineHeight: 16,
    fontFamily: 'Geist_700Bold',
  },
  stickerTaskHeading: {
    fontSize: 14,
    lineHeight: 17,
    fontFamily: 'Geist_700Bold',
  },
  stickerTask: {
    minHeight: 33,
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stickerCheck: {
    width: 20,
    height: 20,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickerCheckGlyph: {
    fontSize: 12,
    lineHeight: 15,
    fontFamily: 'Geist_700Bold',
  },
  stickerEmpty: {
    width: 20,
    height: 20,
    borderRadius: 13,
    borderWidth: 2,
  },
  stickerXp: {
    minWidth: 30,
    minHeight: 23,
    paddingHorizontal: 5,
    borderWidth: 2,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickerXpText: {
    fontSize: 9,
    lineHeight: 11,
    fontFamily: 'Geist_700Bold',
  },
  softHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  softGreeting: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Georgia',
  },
  softName: {
    fontSize: 21,
    lineHeight: 25,
    fontFamily: 'Georgia',
  },
  softAvatar: {
    width: 34,
    height: 34,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  softAvatarText: {
    fontSize: 10,
    lineHeight: 13,
    fontFamily: 'Geist_700Bold',
  },
  softScore: {
    borderRadius: 22,
    paddingHorizontal: 8,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    shadowColor: '#2F2454',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 1,
  },
  ringWrap: {
    width: 74,
    height: 74,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
  },
  softNumber: {
    fontSize: 15,
    lineHeight: 18,
    fontFamily: 'Georgia',
  },
  ringCaption: {
    fontSize: 6,
    lineHeight: 8,
    fontFamily: 'Geist_500Medium',
  },
  softScoreDetails: {
    flex: 1,
    gap: 3,
  },
  softGoal: {
    fontSize: 8,
    lineHeight: 11,
    fontFamily: 'Geist_500Medium',
  },
  softGoalProgress: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Georgia',
  },
  softStreak: {
    alignSelf: 'flex-start',
    minHeight: 19,
    paddingHorizontal: 6,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  softStreakGlyph: {
    fontSize: 8,
  },
  softStreakText: {
    fontSize: 7,
    lineHeight: 10,
    fontFamily: 'Geist_700Bold',
  },
  memberChips: {
    flexDirection: 'row',
    gap: 4,
  },
  memberChip: {
    flex: 1,
    minHeight: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  memberChipName: {
    fontSize: 7,
    lineHeight: 9,
    fontFamily: 'Geist_500Medium',
  },
  memberChipPoints: {
    fontSize: 9,
    lineHeight: 12,
    fontFamily: 'Geist_700Bold',
  },
  softTaskHeading: {
    fontSize: 15,
    lineHeight: 19,
    fontFamily: 'Georgia',
  },
  softTask: {
    minHeight: 33,
    borderRadius: 13,
    paddingHorizontal: 7,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  softCheck: {
    width: 20,
    height: 20,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  softEmpty: {
    width: 20,
    height: 20,
    borderRadius: 11,
    borderWidth: 1.5,
  },
  softXp: {
    overflow: 'hidden',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 3,
    fontSize: 9,
    lineHeight: 12,
    fontFamily: 'Geist_700Bold',
  },
});

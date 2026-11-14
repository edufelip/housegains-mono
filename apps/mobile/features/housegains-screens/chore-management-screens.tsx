import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  PanResponder,
  Pressable,
  TextInput,
  View,
  type PanResponderGestureState,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Button, Card, Label, Screen } from '@/components/housegains/ui';
import { useAppearance } from '@/features/appearance';
import { useHouseGainsTranslation } from '@/localization/housegains';
import { FormField, HouseGainsGlyph, tokenShadowStyle } from './screen-elements';
import { choreDisplayName, subtaskDisplayName } from './screen-model';
import type { Chore, Household, Member } from '@/features/household';

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const WEEKDAY_CODES: Record<number, string> = {
  0: 'SU',
  1: 'MO',
  2: 'TU',
  3: 'WE',
  4: 'TH',
  5: 'FR',
  6: 'SA',
};
const CODE_WEEKDAYS = Object.fromEntries(
  Object.entries(WEEKDAY_CODES).map(([day, code]) => [code, Number(day)]),
) as Record<string, number>;
const CHORE_ICONS = ['🐾', '🍽️', '🧼', '🛋️', '👕', '🗑️', '🍃', '🏠'] as const;
const CATEGORIES = [
  'household',
  'kitchen',
  'bathroom',
  'pets',
  'living',
  'plants',
  'other',
] as const;

type ChoreListScreenProps = {
  household: Household;
  currentMember: Member;
  chores: Chore[];
  members: Member[];
  onBack: () => void;
  onAddCatalog: () => void;
  onBuildCustom: () => void;
  onEdit: (id: string) => void;
  onPause: (id: string) => void;
  onDelete: (id: string) => void;
  onAssign: (id: string, memberIds: string[]) => void | Promise<void>;
  hasError: boolean;
};

export function ChoreListScreen({
  household,
  currentMember,
  chores,
  members,
  onBack,
  onAddCatalog,
  onBuildCustom,
  onEdit,
  onPause,
  onDelete,
  onAssign,
  hasError,
}: ChoreListScreenProps) {
  const { tokens } = useAppearance();
  const { t } = useHouseGainsTranslation();
  const [assignmentBusy, setAssignmentBusy] = useState(false);
  const [assignmentError, setAssignmentError] = useState(false);
  const [reassignId, setReassignId] = useState<string | null>(null);
  const [assignmentDraft, setAssignmentDraft] = useState<string[]>([]);
  const isCreator = currentMember.role === 'creator';
  const activeChores = chores.filter((chore) => chore.isActive);
  const pausedChores = chores.filter((chore) => !chore.isActive);
  const weeklyXp = activeChores.reduce(
    (total, chore) => total + choreXp(chore) * occurrencesPerWeek(chore.recurrence),
    0,
  );

  const startReassign = (chore: Chore) => {
    setReassignId(chore.id);
    setAssignmentDraft([...chore.assigneeIds]);
  };

  const toggleAssignment = (memberId: string) => {
    setAssignmentDraft((current) =>
      current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId],
    );
  };

  const saveAssignments = async (choreId: string) => {
    if (assignmentBusy) return;
    setAssignmentBusy(true);
    setAssignmentError(false);
    try {
      await onAssign(choreId, assignmentDraft);
      setReassignId(null);
    } catch {
      setAssignmentError(true);
    } finally {
      setAssignmentBusy(false);
    }
  };

  const confirmDelete = (chore: Chore) => {
    Alert.alert(
      t('housegains.screens.chores.confirmDeleteTitle'),
      t('housegains.screens.chores.confirmDeleteBody', { name: choreDisplayName(chore, t) }),
      [
        { text: t('housegains.screens.common.cancel'), style: 'cancel' },
        {
          text: t('housegains.screens.chores.confirmDelete'),
          style: 'destructive',
          onPress: () => onDelete(chore.id),
        },
      ],
    );
  };

  return (
    <Screen
      contentContainerStyle={{ gap: 16, padding: 18, paddingBottom: 30 }}
      testID="housegains.chores"
    >
      <ScreenBackBar
        title={household.name}
        icon={household.icon}
        onBack={onBack}
        backLabel={t('housegains.screens.common.back')}
      />
      <View style={{ gap: 7 }}>
        <Label variant="title">{t('housegains.screens.chores.title')}</Label>
        <Label variant="body">{t('housegains.screens.chores.description')}</Label>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <SummaryPill
          testID="housegains.chores.status.active"
          title={t('housegains.screens.chores.activeCount', { count: activeChores.length })}
        />
        <SummaryPill
          testID="housegains.chores.status.paused"
          title={t('housegains.screens.chores.pausedCount', { count: pausedChores.length })}
        />
        <SummaryPill
          testID="housegains.chores.status.weeklyXp"
          title={t('housegains.screens.chores.activeXpWeekly', { xp: weeklyXp })}
        />
      </View>

      <Card
        style={{ backgroundColor: tokens.accent, gap: 5, padding: 13 }}
        testID="housegains.chores.nextOccurrenceNote"
      >
        <Label style={{ fontWeight: '800' }}>
          {t('housegains.screens.chores.futureOnlyTitle')}
        </Label>
        <Label>{t('housegains.screens.chores.futureOnlyBody')}</Label>
      </Card>

      {!isCreator ? (
        <Card
          style={{ borderColor: tokens.accent, padding: 12 }}
          testID="housegains.chores.memberReadOnly"
        >
          <Label style={{ fontWeight: '700' }}>
            {t('housegains.screens.chores.memberReadOnly')}
          </Label>
        </Card>
      ) : null}

      {chores.length === 0 ? (
        <Card
          style={{ alignItems: 'center', gap: 8, padding: 22 }}
          testID="housegains.chores.empty"
        >
          <Label variant="heading">{t('housegains.screens.chores.emptyTitle')}</Label>
          <Label style={{ textAlign: 'center' }}>
            {t('housegains.screens.chores.emptyDescription')}
          </Label>
        </Card>
      ) : (
        chores.map((chore) => {
          const assignees = members.filter((member) => chore.assigneeIds.includes(member.id));
          const editingAssignments = reassignId === chore.id;
          const assignedNames =
            assignees.length > 0
              ? assignees.map(({ name }) => name).join(', ')
              : t('housegains.screens.common.unassigned');
          return (
            <Card
              key={chore.id}
              style={{
                backgroundColor: chore.isActive ? tokens.surface : tokens.canvas,
                gap: 12,
                opacity: chore.isActive ? 1 : 0.78,
                padding: 13,
              }}
              testID={`housegains.chores.item.${chore.id}`}
            >
              <View style={{ alignItems: 'center', flexDirection: 'row', gap: 12 }}>
                <View
                  style={{
                    alignItems: 'center',
                    backgroundColor: chore.isActive ? tokens.accent : tokens.canvas,
                    borderColor: tokens.border,
                    borderRadius: 14,
                    borderWidth: tokens.borderWidth,
                    height: 52,
                    justifyContent: 'center',
                    width: 52,
                  }}
                >
                  <HouseGainsGlyph icon={chore.icon} size={25} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <View
                    style={{ alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}
                  >
                    <Label style={{ fontWeight: '800' }}>{choreDisplayName(chore, t)}</Label>
                    <StatusPill active={chore.isActive} />
                  </View>
                  <Label variant="caption">
                    {t('housegains.screens.chores.choreMeta', {
                      count: chore.subtasks.length,
                      recurrence: recurrenceLabel(chore.recurrence, t),
                      xp: choreXp(chore),
                    })}
                  </Label>
                  <Label style={{ fontWeight: '700' }}>{assignedNames}</Label>
                </View>
                {isCreator ? (
                  <Pressable
                    accessibilityLabel={t('housegains.screens.chores.edit', {
                      name: choreDisplayName(chore, t),
                    })}
                    accessibilityRole="button"
                    onPress={() => onEdit(chore.id)}
                    testID={`housegains.chores.edit.${chore.id}`}
                    style={iconActionStyle(tokens)}
                  >
                    <Label style={{ fontSize: 21 }}>›</Label>
                  </Pressable>
                ) : null}
              </View>

              {isCreator ? (
                editingAssignments ? (
                  <View
                    style={{
                      borderTopColor: tokens.border,
                      borderTopWidth: tokens.borderWidth,
                      gap: 11,
                      paddingTop: 12,
                    }}
                  >
                    <Label variant="eyebrow">{t('housegains.screens.chores.assigneeList')}</Label>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {members.map((member) => {
                        const selected = assignmentDraft.includes(member.id);
                        return (
                          <Pressable
                            key={member.id}
                            accessibilityLabel={t('housegains.screens.chores.assignmentToggle', {
                              name: member.name,
                            })}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            onPress={() => toggleAssignment(member.id)}
                            style={{
                              alignItems: 'center',
                              backgroundColor: selected ? member.color : tokens.surface,
                              borderColor: tokens.border,
                              borderRadius: 999,
                              borderWidth: tokens.borderWidth,
                              flexDirection: 'row',
                              gap: 8,
                              minHeight: 44,
                              paddingHorizontal: 12,
                            }}
                            testID={`housegains.chores.assignment.${chore.id}.${member.id}`}
                          >
                            <Label
                              style={{
                                color: selected ? '#111111' : tokens.text,
                                fontWeight: '800',
                              }}
                            >
                              {member.initials}
                            </Label>
                            <Label
                              style={{
                                color: selected ? '#111111' : tokens.text,
                                fontWeight: '700',
                              }}
                            >
                              {member.name}
                            </Label>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Label variant="caption">{t('housegains.screens.chores.noAssignees')}</Label>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Button
                        disabled={assignmentBusy}
                        onPress={() => void saveAssignments(chore.id)}
                        title={t('housegains.screens.chores.saveAssignments')}
                        testID={`housegains.chores.assignmentsSave.${chore.id}`}
                        style={{ flex: 1 }}
                      />
                      <Button
                        disabled={assignmentBusy}
                        onPress={() => setReassignId(null)}
                        title={t('housegains.screens.chores.cancelAssignments')}
                        variant="outline"
                        style={{ flex: 1 }}
                      />
                    </View>
                  </View>
                ) : (
                  <View
                    style={{ alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
                  >
                    <ActionChip
                      title={t(
                        chore.isActive
                          ? 'housegains.screens.chores.pause'
                          : 'housegains.screens.chores.resume',
                      )}
                      accessibilityLabel={t(
                        chore.isActive
                          ? 'housegains.screens.chores.pause'
                          : 'housegains.screens.chores.resume',
                        { name: choreDisplayName(chore, t) },
                      )}
                      onPress={() => onPause(chore.id)}
                      testID={`housegains.chores.pause.${chore.id}`}
                    />
                    <ActionChip
                      title={t('housegains.screens.chores.reassign')}
                      onPress={() => startReassign(chore)}
                      testID={`housegains.chores.reassign.${chore.id}`}
                    />
                    <ActionChip
                      title={t('housegains.screens.chores.delete')}
                      color={tokens.danger}
                      onPress={() => confirmDelete(chore)}
                      testID={`housegains.chores.delete.${chore.id}`}
                    />
                  </View>
                )
              ) : null}
            </Card>
          );
        })
      )}

      {hasError || assignmentError ? (
        <Card style={{ borderColor: tokens.danger }} testID="housegains.chores.actionError">
          <Label style={{ color: tokens.danger, fontWeight: '700' }}>
            {t('housegains.screens.common.actionError')}
          </Label>
        </Card>
      ) : null}

      {isCreator ? (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
          <Button
            onPress={onAddCatalog}
            title={t('housegains.screens.chores.addCatalog')}
            variant="outline"
            style={{ flex: 1 }}
          />
          <Button
            onPress={onBuildCustom}
            title={t('housegains.screens.chores.buildCustom')}
            style={{ flex: 1 }}
          />
        </View>
      ) : null}
    </Screen>
  );
}

type BuilderScreenProps = {
  initialChore: Chore | null;
  template: Chore | null;
  members: Member[];
  onSave: (chore: Chore) => Promise<void>;
  onCancel: () => void;
  hasError: boolean;
};

type DraftSubtask = { id: string; name: string; xp: string };
type RecurrenceKind = 'daily' | 'weekly' | 'every';
type RecurrenceDraft = { kind: RecurrenceKind; weekdays: number[]; interval: string };
type BuilderErrors = {
  name?: boolean;
  weekdays?: boolean;
  interval?: boolean;
  dueTime?: boolean;
  subtaskCount?: boolean;
  subtaskNames: Record<string, boolean>;
  subtaskXp: Record<string, boolean>;
  bonusXp?: boolean;
};

export function BuilderScreen({
  initialChore,
  template,
  members,
  onSave,
  onCancel,
  hasError,
}: BuilderScreenProps) {
  const { tokens } = useAppearance();
  const { t } = useHouseGainsTranslation();
  const source = initialChore ?? template;
  const [name, setName] = useState(() => (source ? choreDisplayName(source, t) : ''));
  const [icon, setIcon] = useState(() => source?.icon ?? CHORE_ICONS[0]);
  const [category, setCategory] = useState(() => source?.category ?? 'household');
  const [recurrence, setRecurrence] = useState<RecurrenceDraft>(() =>
    source ? readRecurrence(source.recurrence) : { kind: 'daily', weekdays: [], interval: '2' },
  );
  const [dueTime, setDueTime] = useState(() => source?.dueTime ?? '20:00');
  const [subtasks, setSubtasks] = useState<DraftSubtask[]>(() =>
    source
      ? [...source.subtasks]
          .sort((a, b) => a.position - b.position)
          .map((subtask) => ({
            id: subtask.id,
            name: subtaskDisplayName(subtask, t),
            xp: String(subtask.xp),
          }))
      : [{ id: createSubtaskId(), name: '', xp: '10' }],
  );
  const [bonusXp, setBonusXp] = useState(() => String(source?.bonusXp ?? 0));
  const [assigneeIds, setAssigneeIds] = useState<string[]>(() => [...(source?.assigneeIds ?? [])]);
  const [errors, setErrors] = useState<BuilderErrors>({ subtaskNames: {}, subtaskXp: {} });
  const [saveFailed, setSaveFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const parsedSubtaskXp = subtasks
    .map((subtask) => Number.parseInt(subtask.xp, 10))
    .map((value) => (Number.isFinite(value) ? value : 0));
  const subtaskXpTotal = parsedSubtaskXp.reduce((sum, value) => sum + value, 0);
  const bonus = Number.parseInt(bonusXp, 10);
  const totalXp = subtaskXpTotal + (Number.isFinite(bonus) ? bonus : 0);

  const updateSubtask = (id: string, field: 'name' | 'xp', value: string) => {
    setSubtasks((current) =>
      current.map((subtask) => (subtask.id === id ? { ...subtask, [field]: value } : subtask)),
    );
  };

  const moveSubtask = useCallback((id: string, targetIndex: number) => {
    setSubtasks((current) => {
      const sourceIndex = current.findIndex((subtask) => subtask.id === id);
      if (
        sourceIndex < 0 ||
        targetIndex < 0 ||
        targetIndex >= current.length ||
        sourceIndex === targetIndex
      )
        return current;
      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }, []);

  const reorderBy = (id: string, distance: number) => {
    const index = subtasks.findIndex((subtask) => subtask.id === id);
    moveSubtask(id, index + distance);
  };

  const changeXp = (subtaskId: string, change: number) => {
    const item = subtasks.find(({ id }) => id === subtaskId);
    if (!item) return;
    const current = Number.parseInt(item.xp, 10);
    const next = Math.max(5, Math.min(100, (Number.isFinite(current) ? current : 10) + change));
    updateSubtask(subtaskId, 'xp', String(next));
  };

  const toggleAssignee = (memberId: string) => {
    setAssigneeIds((current) =>
      current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId],
    );
  };

  const toggleWeekday = (day: number) => {
    setRecurrence((current) => ({
      ...current,
      weekdays: current.weekdays.includes(day)
        ? current.weekdays.filter((value) => value !== day)
        : [...current.weekdays, day],
    }));
  };

  const validate = (): BuilderErrors => {
    const next: BuilderErrors = { subtaskNames: {}, subtaskXp: {} };
    if (name.trim().length === 0) next.name = true;
    if (recurrence.kind === 'weekly' && recurrence.weekdays.length === 0) next.weekdays = true;
    if (recurrence.kind === 'every') {
      const interval = Number.parseInt(recurrence.interval, 10);
      if (!Number.isInteger(interval) || interval < 1 || interval > 365) next.interval = true;
    }
    if (!isValidTime(dueTime)) next.dueTime = true;
    if (subtasks.length < 1 || subtasks.length > 10) next.subtaskCount = true;
    for (const subtask of subtasks) {
      if (!subtask.name.trim()) next.subtaskNames[subtask.id] = true;
      const xp = Number.parseInt(subtask.xp, 10);
      if (!Number.isInteger(xp) || xp < 5 || xp > 100) next.subtaskXp[subtask.id] = true;
    }
    if (!Number.isInteger(bonus) || bonus < 0 || bonus > 50) next.bonusXp = true;
    return next;
  };

  const save = async () => {
    const nextErrors = validate();
    setErrors(nextErrors);
    if (
      nextErrors.name ||
      nextErrors.weekdays ||
      nextErrors.interval ||
      nextErrors.dueTime ||
      nextErrors.subtaskCount ||
      nextErrors.bonusXp ||
      Object.keys(nextErrors.subtaskNames).length > 0 ||
      Object.keys(nextErrors.subtaskXp).length > 0
    )
      return;

    const chore: Chore = {
      id: initialChore?.id ?? createChoreId(),
      name: source && name.trim() === choreDisplayName(source, t) ? source.name : name.trim(),
      catalogId: source?.catalogId ?? (source?.id.startsWith('catalog-') ? source.id : undefined),
      icon,
      category,
      subtasks: subtasks.map((subtask, position) => {
        const original = source?.subtasks.find((item) => item.id === subtask.id);
        return {
          id: subtask.id,
          catalogSubtaskId:
            original?.catalogSubtaskId ??
            (source?.id.startsWith('catalog-') ? original?.id : undefined),
          name:
            original && subtask.name.trim() === subtaskDisplayName(original, t)
              ? original.name
              : subtask.name.trim(),
          xp: Number.parseInt(subtask.xp, 10),
          position,
        };
      }),
      bonusXp: bonus,
      assigneeIds: [...assigneeIds],
      recurrence: serializeRecurrence(recurrence),
      dueTime,
      isActive: initialChore?.isActive ?? true,
    };

    setSaving(true);
    setSaveFailed(false);
    try {
      await onSave(chore);
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      contentContainerStyle={{ gap: 16, padding: 18, paddingBottom: 32 }}
      testID="housegains.builder"
    >
      <ScreenBackBar
        title={t(
          initialChore
            ? 'housegains.screens.builder.titleEdit'
            : 'housegains.screens.builder.titleNew',
        )}
        onBack={onCancel}
        backLabel={t('housegains.screens.common.cancel')}
        close
      />
      {initialChore ? (
        <Card
          style={{ backgroundColor: tokens.accent, gap: 4, padding: 12 }}
          testID="housegains.builder.nextOccurrenceNote"
        >
          <Label style={{ fontWeight: '800' }}>
            {t('housegains.screens.builder.editNextOccurrence')}
          </Label>
        </Card>
      ) : null}

      <FormField
        label={t('housegains.screens.builder.name')}
        value={name}
        onChangeText={setName}
        placeholder={t('housegains.screens.builder.namePlaceholder')}
        returnKeyType="next"
        testID="housegains.builder.name"
      />
      {errors.name ? (
        <FieldError
          testID="housegains.builder.error.name"
          text={t('housegains.screens.builder.error.requiredName')}
        />
      ) : null}

      <View style={{ gap: 9 }}>
        <Label variant="eyebrow">{t('housegains.screens.builder.icon')}</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {CHORE_ICONS.map((choice, index) => {
            const selected = icon === choice;
            return (
              <Pressable
                key={choice}
                accessibilityLabel={t('housegains.screens.builder.iconChoice', {
                  number: index + 1,
                })}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setIcon(choice)}
                style={({ pressed }) => ({
                  alignItems: 'center',
                  backgroundColor: selected ? tokens.accent : tokens.surface,
                  borderColor: tokens.border,
                  borderRadius: tokens.radius,
                  borderWidth: selected ? Math.max(2, tokens.borderWidth) : tokens.borderWidth,
                  height: 50,
                  justifyContent: 'center',
                  opacity: pressed ? 0.83 : 1,
                  width: 50,
                  ...tokenShadowStyle(tokens.shadow),
                })}
                testID={`housegains.builder.icon.${index}`}
              >
                <HouseGainsGlyph icon={choice} size={25} />
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ gap: 9 }}>
        <Label variant="eyebrow">{t('housegains.screens.builder.category')}</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {CATEGORIES.map((choice) => (
            <ChoiceChip
              key={choice}
              selected={category === choice}
              title={t(`housegains.screens.builder.category.${choice}`)}
              onPress={() => setCategory(choice)}
              testID={`housegains.builder.category.${choice}`}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <Label variant="eyebrow">{t('housegains.screens.builder.recurrence')}</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(['daily', 'weekly', 'every'] as const).map((kind) => (
            <ChoiceChip
              key={kind}
              selected={recurrence.kind === kind}
              title={t(`housegains.screens.builder.recurrence.${kind}`)}
              onPress={() => setRecurrence((current) => ({ ...current, kind }))}
              testID={`housegains.builder.recurrence.${kind}`}
              style={{ flexGrow: 1 }}
            />
          ))}
        </View>
        {recurrence.kind === 'weekly' ? (
          <View style={{ gap: 7 }}>
            <Label variant="caption">{t('housegains.screens.builder.weekdays')}</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
              {WEEKDAY_ORDER.map((day) => (
                <ChoiceChip
                  key={day}
                  selected={recurrence.weekdays.includes(day)}
                  title={t(`housegains.screens.builder.weekday.${day}`)}
                  onPress={() => toggleWeekday(day)}
                  testID={`housegains.builder.weekday.${day}`}
                  style={{ minWidth: 42, paddingHorizontal: 10 }}
                />
              ))}
            </View>
            {errors.weekdays ? (
              <FieldError
                testID="housegains.builder.error.weekdays"
                text={t('housegains.screens.builder.error.weekdayRequired')}
              />
            ) : null}
          </View>
        ) : null}
        {recurrence.kind === 'every' ? (
          <View style={{ gap: 8 }}>
            <FormField
              label={t('housegains.screens.builder.everyDaysCount')}
              value={recurrence.interval}
              onChangeText={(value) =>
                setRecurrence((current) => ({ ...current, interval: value.replace(/[^0-9]/g, '') }))
              }
              keyboardType="number-pad"
              testID="housegains.builder.interval"
            />
            {errors.interval ? (
              <FieldError
                testID="housegains.builder.error.interval"
                text={t('housegains.screens.builder.error.invalidInterval')}
              />
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={{ gap: 8 }}>
        <FormField
          label={t('housegains.screens.builder.dueTime')}
          value={dueTime}
          onChangeText={setDueTime}
          placeholder={t('housegains.screens.builder.dueTimePlaceholder')}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
          testID="housegains.builder.dueTime"
        />
        {errors.dueTime ? (
          <FieldError
            testID="housegains.builder.error.dueTime"
            text={t('housegains.screens.builder.error.invalidDueTime')}
          />
        ) : null}
      </View>

      <View style={{ gap: 9 }}>
        <View
          style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}
        >
          <Label variant="heading">{t('housegains.screens.builder.subtasks')}</Label>
          <Label variant="caption">{t('housegains.screens.builder.subtaskXpHint')}</Label>
        </View>
        {errors.subtaskCount ? (
          <FieldError
            testID="housegains.builder.error.subtaskCount"
            text={t('housegains.screens.builder.error.subtaskCount')}
          />
        ) : null}
        {subtasks.map((subtask, index) => (
          <SubtaskDraftRow
            key={subtask.id}
            id={subtask.id}
            index={index}
            count={subtasks.length}
            name={subtask.name}
            xp={subtask.xp}
            tokens={tokens}
            onNameChange={(value) => updateSubtask(subtask.id, 'name', value)}
            onXpChange={(value) => updateSubtask(subtask.id, 'xp', value)}
            onXpStep={(change) => changeXp(subtask.id, change)}
            onMoveTo={(target) => moveSubtask(subtask.id, target)}
            onMove={(change) => reorderBy(subtask.id, change)}
            onRemove={() =>
              setSubtasks((current) => current.filter((item) => item.id !== subtask.id))
            }
            canRemove={subtasks.length > 1}
            nameError={Boolean(errors.subtaskNames[subtask.id])}
            xpError={Boolean(errors.subtaskXp[subtask.id])}
            t={t}
          />
        ))}
        <DashedAction
          title={t('housegains.screens.builder.addSubtask')}
          accessibilityLabel={t('housegains.screens.builder.addSubtask')}
          disabled={subtasks.length >= 10}
          onPress={() =>
            setSubtasks((current) => [...current, { id: createSubtaskId(), name: '', xp: '10' }])
          }
          testID="housegains.builder.addSubtask"
        />
      </View>

      <Card
        style={{ backgroundColor: tokens.accent, gap: 10, padding: 14 }}
        testID="housegains.builder.bonus"
      >
        <View
          style={{
            alignItems: 'center',
            flexDirection: 'row',
            gap: 10,
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flex: 1, gap: 3 }}>
            <Label variant="heading">{t('housegains.screens.builder.bonusTitle')}</Label>
            <Label variant="caption">{t('housegains.screens.builder.bonusHint')}</Label>
          </View>
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: 6 }}>
            <StepButton
              title="−"
              accessibilityLabel={t('housegains.screens.builder.bonusDecrease')}
              onPress={() =>
                setBonusXp(String(Math.max(0, (Number.parseInt(bonusXp, 10) || 0) - 5)))
              }
              testID="housegains.builder.bonus.decrease"
            />
            <TextInput
              accessibilityLabel={t('housegains.screens.builder.bonusTitle')}
              keyboardType="number-pad"
              maxLength={2}
              onChangeText={(value) => setBonusXp(value.replace(/[^0-9]/g, ''))}
              selectTextOnFocus
              style={fieldValueStyle(tokens, {
                minWidth: 64,
                textAlign: 'center',
                fontWeight: '800',
              })}
              testID="housegains.builder.bonusXp"
              value={bonusXp}
            />
            <StepButton
              title="＋"
              accessibilityLabel={t('housegains.screens.builder.bonusIncrease')}
              onPress={() =>
                setBonusXp(String(Math.min(50, (Number.parseInt(bonusXp, 10) || 0) + 5)))
              }
              testID="housegains.builder.bonus.increase"
            />
          </View>
        </View>
        {errors.bonusXp ? (
          <FieldError
            testID="housegains.builder.error.bonusXp"
            text={t('housegains.screens.builder.error.bonusXp')}
          />
        ) : null}
      </Card>

      <View style={{ gap: 9 }}>
        <Label variant="eyebrow">{t('housegains.screens.builder.assignees')}</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {members.map((member) => {
            const selected = assigneeIds.includes(member.id);
            return (
              <Pressable
                key={member.id}
                accessibilityLabel={t('housegains.screens.builder.assigneeToggle', {
                  name: member.name,
                })}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => toggleAssignee(member.id)}
                style={{
                  alignItems: 'center',
                  backgroundColor: selected ? member.color : tokens.surface,
                  borderColor: tokens.border,
                  borderRadius: 999,
                  borderStyle: selected ? 'solid' : 'dashed',
                  borderWidth: tokens.borderWidth,
                  flexDirection: 'row',
                  gap: 8,
                  minHeight: 48,
                  paddingHorizontal: 13,
                }}
                testID={`housegains.builder.assignee.${member.id}`}
              >
                <Label style={{ color: selected ? '#111111' : tokens.text, fontWeight: '800' }}>
                  {member.initials}
                </Label>
                <Label style={{ color: selected ? '#111111' : tokens.text, fontWeight: '700' }}>
                  {member.name}
                </Label>
              </Pressable>
            );
          })}
        </View>
        <Label variant="caption">{t('housegains.screens.builder.noAssignees')}</Label>
      </View>

      <View
        style={{
          borderColor: tokens.border,
          borderTopWidth: tokens.borderWidth,
          gap: 12,
          paddingTop: 14,
        }}
      >
        <Label testID="housegains.builder.maxXp" style={{ fontWeight: '800', textAlign: 'center' }}>
          {t('housegains.screens.builder.maxXpSummary', {
            subtasksXp: subtaskXpTotal,
            bonusXp: Number.isFinite(bonus) ? bonus : 0,
            xp: totalXp,
          })}
        </Label>
        {saveFailed ? (
          <FieldError
            testID="housegains.builder.saveError"
            text={t('housegains.screens.builder.error.save')}
          />
        ) : null}
        {hasError ? (
          <FieldError
            testID="housegains.builder.externalError"
            text={t('housegains.screens.common.actionError')}
          />
        ) : null}
        <Button
          onPress={() => void save()}
          title={
            saving
              ? t('housegains.screens.builder.saving')
              : saveFailed
                ? t('housegains.screens.builder.retrySave')
                : t('housegains.screens.builder.save')
          }
          disabled={saving}
          testID="housegains.builder.save"
        />
        <Button
          onPress={onCancel}
          title={t('housegains.screens.builder.cancel')}
          variant="outline"
        />
      </View>
    </Screen>
  );
}

type CatalogDetailScreenProps = {
  chore: Chore;
  onBack: () => void;
  onCustomize: (chore: Chore) => void;
  onUseAsIs: (chore: Chore) => void | Promise<void>;
};

export function CatalogDetailScreen({
  chore,
  onBack,
  onCustomize,
  onUseAsIs,
}: CatalogDetailScreenProps) {
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const saveCatalogCopy = async () => {
    if (copyBusy) return;
    setCopyBusy(true);
    setCopyError(false);
    try {
      await onUseAsIs(chore);
    } catch {
      setCopyError(true);
    } finally {
      setCopyBusy(false);
    }
  };
  const { tokens } = useAppearance();
  const { t } = useHouseGainsTranslation();
  const orderedSubtasks = [...chore.subtasks].sort((a, b) => a.position - b.position);
  const suggestedXp = chore.subtasks.reduce((sum, subtask) => sum + subtask.xp, 0);
  const totalXp = suggestedXp + chore.bonusXp;
  const minutes = orderedSubtasks.reduce((sum, subtask) => sum + estimatedMinutes(subtask.xp), 0);
  const catalogName = catalogTranslation(t, chore.id, 'name', chore.name);
  const recurrence = recurrenceLabel(chore.recurrence, t);

  return (
    <Screen
      contentContainerStyle={{ gap: 17, padding: 18, paddingBottom: 28 }}
      testID="housegains.catalogDetail"
    >
      <ScreenBackBar
        title={t('housegains.screens.catalogDetail.title')}
        icon={undefined}
        onBack={onBack}
        backLabel={t('housegains.screens.common.back')}
      />
      <Card
        style={{ backgroundColor: tokens.accent, gap: 12, padding: 17 }}
        testID="housegains.catalogDetail.hero"
      >
        <View
          style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}
        >
          <View
            style={{
              alignItems: 'center',
              backgroundColor: tokens.surface,
              borderColor: tokens.border,
              borderRadius: tokens.radius,
              borderWidth: tokens.borderWidth,
              height: 58,
              justifyContent: 'center',
              width: 58,
            }}
          >
            <HouseGainsGlyph icon={chore.icon} size={28} />
          </View>
          <Label
            testID="housegains.catalogDetail.recommended"
            style={{
              backgroundColor: tokens.success,
              borderColor: tokens.border,
              borderRadius: 999,
              borderWidth: tokens.borderWidth,
              fontWeight: '800',
              paddingHorizontal: 12,
              paddingVertical: 6,
            }}
          >
            {t('housegains.screens.catalogDetail.recommended')}
          </Label>
        </View>
        <Label variant="title">{catalogName}</Label>
        <Label style={{ fontWeight: '700' }}>
          {t('housegains.screens.catalogDetail.overview', { recurrence, minutes, xp: totalXp })}
        </Label>
      </Card>

      <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}>
        <Label variant="heading">{t('housegains.screens.catalogDetail.subtasks')}</Label>
        <Label variant="eyebrow">{t('housegains.screens.catalogDetail.suggestedXp')}</Label>
      </View>
      {orderedSubtasks.map((subtask) => (
        <Card
          key={subtask.id}
          style={{ alignItems: 'center', flexDirection: 'row', gap: 10, padding: 13 }}
          testID={`housegains.catalogDetail.subtask.${subtask.id}`}
        >
          <View style={{ flex: 1, gap: 3 }}>
            <Label style={{ fontWeight: '800' }}>
              {catalogTranslation(t, subtask.id, 'subtask', subtask.name)}
            </Label>
            <Label variant="caption">
              {t('housegains.screens.catalogDetail.effortMinutes', {
                minutes: estimatedMinutes(subtask.xp),
              })}
            </Label>
          </View>
          <XpPill title={t('housegains.screens.common.xp', { xp: subtask.xp })} />
        </Card>
      ))}

      <Card
        style={{
          backgroundColor: tokens.accent,
          borderStyle: 'dashed',
          flexDirection: 'row',
          gap: 9,
          justifyContent: 'space-between',
          padding: 13,
        }}
      >
        <Label style={{ fontWeight: '800' }}>
          {t('housegains.screens.catalogDetail.completionBonus')}
        </Label>
        <XpPill title={t('housegains.screens.common.xp', { xp: chore.bonusXp })} />
      </Card>
      <Label variant="caption" testID="housegains.catalogDetail.effort">
        {t('housegains.screens.catalogDetail.effortHint')}
      </Label>

      {copyError ? (
        <Card testID="housegains.catalogDetail.saveError">
          <Label>{t('housegains.screens.common.actionError')}</Label>
        </Card>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
        <Button
          onPress={() => onCustomize(chore)}
          title={t('housegains.screens.catalogDetail.customize')}
          variant="outline"
          style={{ flex: 1 }}
          testID="housegains.catalogDetail.customize"
        />
        <Button
          disabled={copyBusy}
          onPress={() => void saveCatalogCopy()}
          title={t('housegains.screens.catalogDetail.useAsIs')}
          style={{ flex: 1 }}
          testID="housegains.catalogDetail.useAsIs"
        />
      </View>
    </Screen>
  );
}

function ScreenBackBar({
  title,
  icon,
  onBack,
  backLabel,
  close = false,
}: {
  title: string;
  icon?: string;
  onBack: () => void;
  backLabel: string;
  close?: boolean;
}) {
  const { tokens } = useAppearance();
  return (
    <View style={{ alignItems: 'center', flexDirection: 'row', gap: 12 }}>
      <Pressable
        accessibilityLabel={backLabel}
        accessibilityRole="button"
        onPress={onBack}
        style={({ pressed }) => ({
          alignItems: 'center',
          backgroundColor: tokens.surface,
          borderColor: tokens.border,
          borderRadius: tokens.radius,
          borderWidth: tokens.borderWidth,
          height: 48,
          justifyContent: 'center',
          opacity: pressed ? 0.8 : 1,
          width: 48,
          ...tokenShadowStyle(tokens.shadow),
        })}
        testID="housegains.screen.back"
      >
        <Label style={{ fontSize: 27, lineHeight: 30 }}>{close ? '×' : '‹'}</Label>
      </Pressable>
      {icon ? <HouseGainsGlyph icon={icon} size={22} /> : null}
      <Label style={{ flex: 1, fontWeight: '800' }}>{title}</Label>
    </View>
  );
}

function SummaryPill({ title, testID }: { title: string; testID: string }) {
  const { tokens } = useAppearance();
  return (
    <View
      accessibilityRole="text"
      style={{
        backgroundColor: tokens.surface,
        borderColor: tokens.border,
        borderRadius: 999,
        borderWidth: tokens.borderWidth,
        paddingHorizontal: 12,
        paddingVertical: 7,
        ...tokenShadowStyle(tokens.shadow),
      }}
      testID={testID}
    >
      <Label style={{ fontWeight: '800' }}>{title}</Label>
    </View>
  );
}

function StatusPill({ active }: { active: boolean }) {
  const { tokens } = useAppearance();
  const { t } = useHouseGainsTranslation();
  return (
    <View
      style={{
        backgroundColor: active ? tokens.success : tokens.canvas,
        borderColor: tokens.border,
        borderRadius: 999,
        borderWidth: tokens.borderWidth,
        paddingHorizontal: 8,
        paddingVertical: 2,
      }}
    >
      <Label style={{ fontSize: 12, fontWeight: '800' }}>
        {t(
          active
            ? 'housegains.screens.chores.status.active'
            : 'housegains.screens.chores.status.paused',
        )}
      </Label>
    </View>
  );
}

function ActionChip({
  title,
  onPress,
  testID,
  color,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  testID: string;
  color?: string;
  accessibilityLabel?: string;
}) {
  const { tokens } = useAppearance();
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        backgroundColor: tokens.surface,
        borderColor: color ?? tokens.border,
        borderRadius: 999,
        borderWidth: tokens.borderWidth,
        justifyContent: 'center',
        minHeight: 42,
        opacity: pressed ? 0.78 : 1,
        paddingHorizontal: 12,
      })}
      testID={testID}
    >
      <Label style={{ color: color ?? tokens.text, fontWeight: '700' }}>{title}</Label>
    </Pressable>
  );
}

function ChoiceChip({
  title,
  selected,
  onPress,
  testID,
  style,
}: {
  title: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { tokens } = useAppearance();
  return (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        {
          alignItems: 'center',
          backgroundColor: selected ? tokens.primary : tokens.surface,
          borderColor: tokens.border,
          borderRadius: 999,
          borderWidth: tokens.borderWidth,
          justifyContent: 'center',
          minHeight: 44,
          opacity: pressed ? 0.82 : 1,
          paddingHorizontal: 13,
        },
        style,
      ]}
      testID={testID}
    >
      <Label style={{ color: selected ? tokens.onPrimary : tokens.text, fontWeight: '700' }}>
        {title}
      </Label>
    </Pressable>
  );
}

function SubtaskDraftRow({
  id,
  index,
  count,
  name,
  xp,
  tokens,
  onNameChange,
  onXpChange,
  onXpStep,
  onMoveTo,
  onMove,
  onRemove,
  canRemove,
  nameError,
  xpError,
  t,
}: {
  id: string;
  index: number;
  count: number;
  name: string;
  xp: string;
  tokens: ReturnType<typeof useAppearance>['tokens'];
  onNameChange: (value: string) => void;
  onXpChange: (value: string) => void;
  onXpStep: (change: number) => void;
  onMoveTo: (targetIndex: number) => void;
  onMove: (change: number) => void;
  onRemove: () => void;
  canRemove: boolean;
  nameError: boolean;
  xpError: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const indexRef = useRef(index);
  const countRef = useRef(count);
  const dragStartIndex = useRef(index);
  const lastTargetIndex = useRef(index);
  const moveToRef = useRef(onMoveTo);
  indexRef.current = index;
  countRef.current = count;
  moveToRef.current = onMoveTo;
  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) >= 8,
        onPanResponderGrant: () => {
          dragStartIndex.current = indexRef.current;
          lastTargetIndex.current = indexRef.current;
        },
        onPanResponderMove: (_event, gesture: PanResponderGestureState) => {
          const delta = Math.round(gesture.dy / 86);
          const target = Math.max(
            0,
            Math.min(countRef.current - 1, dragStartIndex.current + delta),
          );
          if (delta !== 0 && target !== lastTargetIndex.current) {
            lastTargetIndex.current = target;
            moveToRef.current(target);
          }
        },
      }),
    [],
  );

  return (
    <Card style={{ gap: 9, padding: 10 }} testID={`housegains.builder.subtask.${index}`}>
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 8 }}>
        <View
          accessibilityLabel={t('housegains.screens.builder.dragHandle', { number: index + 1 })}
          accessibilityRole="adjustable"
          accessibilityActions={[
            {
              name: 'increment',
              label: t('housegains.screens.builder.moveDown', { number: index + 1 }),
            },
            {
              name: 'decrement',
              label: t('housegains.screens.builder.moveUp', { number: index + 1 }),
            },
          ]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'increment') onMove(1);
            if (event.nativeEvent.actionName === 'decrement') onMove(-1);
          }}
          style={{ alignItems: 'center', justifyContent: 'center', minHeight: 46, width: 32 }}
          testID={`housegains.builder.drag.${index}`}
          {...responder.panHandlers}
        >
          <Label style={{ color: tokens.muted, fontSize: 22, fontWeight: '800' }}>⠿</Label>
        </View>
        <TextInput
          accessibilityLabel={t('housegains.screens.builder.subtaskName', { number: index + 1 })}
          onChangeText={onNameChange}
          placeholder={t('housegains.screens.builder.subtaskNamePlaceholder')}
          placeholderTextColor={tokens.muted}
          style={[
            fieldValueStyle(tokens, { flex: 1, minHeight: 48, fontWeight: '700' }),
            nameError ? { borderColor: tokens.danger } : null,
          ]}
          testID={`housegains.builder.subtask.${index}.name`}
          value={name}
        />
        {canRemove ? (
          <Pressable
            accessibilityLabel={t('housegains.screens.builder.removeSubtask', {
              number: index + 1,
            })}
            accessibilityRole="button"
            onPress={onRemove}
            style={{ alignItems: 'center', height: 42, justifyContent: 'center', width: 36 }}
            testID={`housegains.builder.remove.${index}`}
          >
            <Label style={{ color: tokens.danger, fontSize: 21 }}>×</Label>
          </Pressable>
        ) : null}
      </View>
      {nameError ? (
        <FieldError
          testID={`housegains.builder.error.subtaskName.${index}`}
          text={t('housegains.screens.builder.error.subtaskName', { number: index + 1 })}
        />
      ) : null}
      <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}>
        <Label variant="caption">{t('housegains.screens.builder.subtaskXp')}</Label>
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: 6 }}>
          <StepButton
            title="−"
            accessibilityLabel={t('housegains.screens.builder.decreaseXp', { number: index + 1 })}
            onPress={() => onXpStep(-5)}
            testID={`housegains.builder.subtask.${index}.decreaseXp`}
          />
          <TextInput
            accessibilityLabel={t('housegains.screens.builder.subtaskXp', { number: index + 1 })}
            keyboardType="number-pad"
            maxLength={3}
            onChangeText={(value) => onXpChange(value.replace(/[^0-9]/g, ''))}
            selectTextOnFocus
            style={[
              fieldValueStyle(tokens, { minWidth: 74, textAlign: 'center', fontWeight: '800' }),
              xpError ? { borderColor: tokens.danger } : null,
            ]}
            testID={`housegains.builder.subtask.${index}.xp`}
            value={xp}
          />
          <StepButton
            title="＋"
            accessibilityLabel={t('housegains.screens.builder.increaseXp', { number: index + 1 })}
            onPress={() => onXpStep(5)}
            testID={`housegains.builder.subtask.${index}.increaseXp`}
          />
        </View>
      </View>
      {xpError ? (
        <FieldError
          testID={`housegains.builder.error.subtaskXp.${index}`}
          text={t('housegains.screens.builder.error.subtaskXp', { number: index + 1 })}
        />
      ) : null}
      <View
        style={{ alignItems: 'center', flexDirection: 'row', gap: 7, justifyContent: 'flex-end' }}
      >
        <MoveButton
          title={t('housegains.screens.builder.moveUpShort')}
          accessibilityLabel={t('housegains.screens.builder.moveUp', { number: index + 1 })}
          disabled={index === 0}
          onPress={() => onMove(-1)}
          testID={`housegains.builder.moveUp.${index}`}
        />
        <MoveButton
          title={t('housegains.screens.builder.moveDownShort')}
          accessibilityLabel={t('housegains.screens.builder.moveDown', { number: index + 1 })}
          disabled={index === count - 1}
          onPress={() => onMove(1)}
          testID={`housegains.builder.moveDown.${index}`}
        />
      </View>
    </Card>
  );
}

function MoveButton({
  title,
  accessibilityLabel,
  disabled,
  onPress,
  testID,
}: {
  title: string;
  accessibilityLabel: string;
  disabled: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { tokens } = useAppearance();
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        alignItems: 'center',
        backgroundColor: tokens.surface,
        borderColor: tokens.border,
        borderRadius: 999,
        borderWidth: tokens.borderWidth,
        justifyContent: 'center',
        minHeight: 40,
        minWidth: 44,
        opacity: disabled ? 0.45 : 1,
        paddingHorizontal: 10,
      }}
      testID={testID}
    >
      <Label style={{ fontWeight: '800' }}>{title}</Label>
    </Pressable>
  );
}

function StepButton({
  title,
  accessibilityLabel,
  onPress,
  testID,
}: {
  title: string;
  accessibilityLabel: string;
  onPress: () => void;
  testID: string;
}) {
  const { tokens } = useAppearance();
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: 'center',
        backgroundColor: tokens.surface,
        borderColor: tokens.border,
        borderRadius: 12,
        borderWidth: tokens.borderWidth,
        height: 42,
        justifyContent: 'center',
        width: 42,
      }}
      testID={testID}
    >
      <Label style={{ fontSize: 20, fontWeight: '800' }}>{title}</Label>
    </Pressable>
  );
}

function DashedAction({
  title,
  accessibilityLabel,
  disabled,
  onPress,
  testID,
}: {
  title: string;
  accessibilityLabel: string;
  disabled?: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { tokens } = useAppearance();
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        backgroundColor: 'transparent',
        borderColor: tokens.border,
        borderRadius: tokens.radius,
        borderStyle: 'dashed',
        borderWidth: tokens.borderWidth,
        flexDirection: 'row',
        gap: 8,
        justifyContent: 'center',
        minHeight: 52,
        opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
      })}
      testID={testID}
    >
      <Label style={{ fontSize: 19, fontWeight: '800' }}>＋</Label>
      <Label style={{ fontWeight: '800' }}>{title}</Label>
    </Pressable>
  );
}

function FieldError({ text, testID }: { text: string; testID: string }) {
  const { tokens } = useAppearance();
  return (
    <Label testID={testID} style={{ color: tokens.danger, fontWeight: '700' }}>
      {text}
    </Label>
  );
}

function XpPill({ title }: { title: string }) {
  const { tokens } = useAppearance();
  return (
    <View
      style={{
        backgroundColor: tokens.accent,
        borderColor: tokens.border,
        borderRadius: 999,
        borderWidth: tokens.borderWidth,
        paddingHorizontal: 11,
        paddingVertical: 6,
      }}
    >
      <Label style={{ fontWeight: '800' }}>{title}</Label>
    </View>
  );
}

function fieldValueStyle(tokens: ReturnType<typeof useAppearance>['tokens'], style?: object) {
  return {
    backgroundColor: tokens.surface,
    borderColor: tokens.border,
    borderRadius: tokens.radius,
    borderWidth: tokens.borderWidth,
    color: tokens.text,
    fontSize: 16,
    minHeight: 42,
    paddingHorizontal: 11,
    ...tokenShadowStyle(tokens.shadow),
    ...style,
  } as const;
}

function iconActionStyle(tokens: ReturnType<typeof useAppearance>['tokens']) {
  return {
    alignItems: 'center' as const,
    backgroundColor: tokens.surface,
    borderColor: tokens.border,
    borderRadius: 14,
    borderWidth: tokens.borderWidth,
    height: 42,
    justifyContent: 'center' as const,
    width: 42,
    ...tokenShadowStyle(tokens.shadow),
  };
}

function recurrenceLabel(
  recurrence: string,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  const rule = readRecurrence(recurrence);
  if (rule.kind === 'daily') return t('housegains.screens.common.daily');
  if (rule.kind === 'every')
    return t('housegains.screens.common.everyDays', { count: rule.interval });
  const days = WEEKDAY_ORDER.filter((day) => rule.weekdays.includes(day)).map((day) =>
    t(`housegains.screens.common.weekday.${day}`),
  );
  return days.length > 0
    ? t('housegains.screens.common.weeklyDays', { days: days.join(', ') })
    : t('housegains.screens.common.weekly');
}

function readRecurrence(value: string): RecurrenceDraft {
  if (value === 'daily' || value === 'FREQ=DAILY;INTERVAL=1')
    return { kind: 'daily', weekdays: [], interval: '2' };
  if (value === 'weekly') return { kind: 'weekly', weekdays: [new Date().getDay()], interval: '2' };
  if (value.startsWith('weekly:')) {
    const weekdays = value
      .slice('weekly:'.length)
      .split(',')
      .map(Number)
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
    return { kind: 'weekly', weekdays: [...new Set(weekdays)], interval: '2' };
  }
  const dailyRule = /^FREQ=DAILY;INTERVAL=(\d+)$/.exec(value);
  if (dailyRule)
    return {
      kind: Number(dailyRule[1]) === 1 ? 'daily' : 'every',
      weekdays: [],
      interval: dailyRule[1],
    };
  const everyRule = /^every:(\d+)$/.exec(value);
  if (everyRule) return { kind: 'every', weekdays: [], interval: everyRule[1] };
  const weeklyRule = /^FREQ=WEEKLY;BYDAY=([A-Z,]+)$/.exec(value);
  if (weeklyRule) {
    return {
      kind: 'weekly',
      weekdays: [
        ...new Set(
          weeklyRule[1]
            .split(',')
            .map((code) => CODE_WEEKDAYS[code])
            .filter((day) => day !== undefined),
        ),
      ],
      interval: '2',
    };
  }
  return { kind: 'daily', weekdays: [], interval: '2' };
}

function serializeRecurrence(recurrence: RecurrenceDraft): string {
  if (recurrence.kind === 'daily') return 'FREQ=DAILY;INTERVAL=1';
  if (recurrence.kind === 'every')
    return `FREQ=DAILY;INTERVAL=${Number.parseInt(recurrence.interval, 10)}`;
  const days = [...recurrence.weekdays]
    .sort(
      (a, b) =>
        WEEKDAY_ORDER.indexOf(a as (typeof WEEKDAY_ORDER)[number]) -
        WEEKDAY_ORDER.indexOf(b as (typeof WEEKDAY_ORDER)[number]),
    )
    .map((day) => WEEKDAY_CODES[day]);
  return `FREQ=WEEKLY;BYDAY=${days.join(',')}`;
}

function choreXp(chore: Chore): number {
  return chore.subtasks.reduce((sum, subtask) => sum + subtask.xp, 0) + chore.bonusXp;
}

function occurrencesPerWeek(recurrence: string): number {
  const rule = readRecurrence(recurrence);
  if (rule.kind === 'daily') return 7;
  if (rule.kind === 'weekly') return rule.weekdays.length;
  const interval = Number.parseInt(rule.interval, 10);
  return Number.isInteger(interval) && interval > 0 ? Math.ceil(7 / interval) : 1;
}

function isValidTime(value: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function estimatedMinutes(xp: number): number {
  return Math.max(1, Math.round(xp / 2));
}

function catalogTranslation(
  t: (key: string, params?: Record<string, string | number>) => string,
  id: string,
  kind: 'name' | 'subtask',
  fallback: string,
): string {
  const key =
    kind === 'name' ? `housegains.catalog.${id}.name` : `housegains.catalog.subtask.${id}`;
  const translated = t(key);
  return translated === key || translated === '' ? fallback : translated;
}

function createSubtaskId(): string {
  return `subtask-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function createChoreId(): string {
  return `chore-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

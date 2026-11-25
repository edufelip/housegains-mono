// "Rate HouseGains" banner on the Today screen. Rating earns nothing: no points, no reward copy.
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Label } from '@/components/housegains/ui';
import { useAppearance } from '@/features/appearance';
import { useAuth } from '@/features/auth';
import { useHouseGainsTranslation } from '@/localization/housegains';
import {
  normalizeRatingPromptState,
  onDismissed,
  onRated,
  shouldShowRatingPrompt,
  type RatingPromptState,
} from './rating-prompt';
import { loadRatingPromptState, saveRatingPromptState } from './rating-prompt-storage';
import { requestStoreRating } from './store-review';

type Visibility = 'hidden' | 'visible';

/**
 * Renders nothing for a signed-out user, and until the stored state says the banner is due. Any
 * storage failure is logged and leaves the banner hidden for this session, so it can never loop
 * or crash the screen.
 */
export function RatingBanner({ now = Date.now }: { now?: () => number }) {
  const { status, user } = useAuth();
  const uid = status === 'signedIn' ? (user?.uid ?? null) : null;
  const { tokens } = useAppearance();
  const { t } = useHouseGainsTranslation();
  const [visibility, setVisibility] = useState<Visibility>('hidden');
  const [busy, setBusy] = useState(false);
  const stateRef = useRef<RatingPromptState | null>(null);
  const nowRef = useRef(now);
  nowRef.current = now;

  useEffect(() => {
    let active = true;
    stateRef.current = null;
    setVisibility('hidden');
    if (uid === null) return undefined;
    void (async () => {
      try {
        const at = nowRef.current();
        const stored = await loadRatingPromptState(uid);
        const state = normalizeRatingPromptState(stored, at);
        // Record firstSeenAt (and any clock correction) before showing anything.
        if (state.firstSeenAt !== stored.firstSeenAt || state.dismissedAt !== stored.dismissedAt) {
          await saveRatingPromptState(uid, state);
        }
        if (!active) return;
        stateRef.current = state;
        if (shouldShowRatingPrompt(state, at)) setVisibility('visible');
      } catch (error) {
        console.warn('[rating] could not load the banner state; staying hidden', error);
      }
    })();
    return () => {
      active = false;
    };
  }, [uid]);

  const settle = useCallback(
    async (next: (state: RatingPromptState, at: number) => RatingPromptState) => {
      const current = stateRef.current;
      if (current === null || uid === null) return;
      const updated = next(current, nowRef.current());
      stateRef.current = updated;
      setVisibility('hidden');
      try {
        await saveRatingPromptState(uid, updated);
      } catch (error) {
        console.warn('[rating] could not save the banner state', error);
      }
    },
    [uid],
  );

  const rate = useCallback(async () => {
    setBusy(true);
    try {
      let outcome: Awaited<ReturnType<typeof requestStoreRating>> = 'unavailable';
      try {
        outcome = await requestStoreRating();
      } catch (error) {
        console.warn('[rating] the store review request failed', error);
      }
      // No store was reachable: treat it like "Not now" so the user is asked again in 14 days.
      await settle(outcome === 'unavailable' ? onDismissed : onRated);
    } finally {
      setBusy(false);
    }
  }, [settle]);

  const notNow = useCallback(() => {
    void settle(onDismissed);
  }, [settle]);

  if (visibility === 'hidden') return null;
  return (
    <Card style={{ gap: tokens.spacing.sm }} testID="housegains.rating.banner">
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: tokens.spacing.sm }}>
        <Ionicons
          accessibilityElementsHidden
          color={tokens.accent}
          importantForAccessibility="no"
          name="star-outline"
          size={tokens.iconSize.lg}
        />
        <Label style={{ flex: 1 }} variant="heading">
          {t('housegains.rating.title')}
        </Label>
      </View>
      <Label>{t('housegains.rating.body')}</Label>
      <Button
        accessibilityLabel={t('housegains.rating.rateA11y')}
        disabled={busy}
        onPress={() => void rate()}
        testID="housegains.rating.rate"
        title={t('housegains.rating.rate')}
      />
      <Button
        accessibilityLabel={t('housegains.rating.notNowA11y')}
        disabled={busy}
        onPress={notNow}
        testID="housegains.rating.notNow"
        title={t('housegains.rating.notNow')}
        variant="ghost"
      />
    </Card>
  );
}

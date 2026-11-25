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

  // The uid currently on screen, and whether a Rate / Not now tap is still being handled.
  const uidRef = useRef(uid);
  uidRef.current = uid;
  const inFlightRef = useRef(false);

  // Applies a tap to the state of the user who tapped. If the signed-in user changed while the
  // store request was pending, that user's state is still saved under their own key, and the new
  // user's banner and state are left alone.
  const settle = useCallback(
    async (
      tapUid: string,
      tapState: RatingPromptState,
      next: (state: RatingPromptState, at: number) => RatingPromptState,
    ) => {
      const updated = next(tapState, nowRef.current());
      if (uidRef.current === tapUid) {
        stateRef.current = updated;
        setVisibility('hidden');
      }
      try {
        await saveRatingPromptState(tapUid, updated);
      } catch (error) {
        console.warn('[rating] could not save the banner state', error);
      }
    },
    [],
  );

  const handleTap = useCallback(
    async (kind: 'rate' | 'notNow') => {
      const tapState = stateRef.current;
      if (inFlightRef.current || uid === null || tapState === null) return;
      inFlightRef.current = true;
      setBusy(true);
      try {
        if (kind === 'notNow') {
          await settle(uid, tapState, onDismissed);
          return;
        }
        let outcome: Awaited<ReturnType<typeof requestStoreRating>> = 'unavailable';
        try {
          outcome = await requestStoreRating();
        } catch (error) {
          console.warn('[rating] the store review request failed', error);
        }
        if (outcome === 'unavailable') {
          console.warn('[rating] no review dialog or store page is reachable; asking again later');
        }
        // No store was reachable: treat it like "Not now" so the user is asked again in 14 days.
        await settle(uid, tapState, outcome === 'unavailable' ? onDismissed : onRated);
      } finally {
        inFlightRef.current = false;
        setBusy(false);
      }
    },
    [settle, uid],
  );

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
        onPress={() => void handleTap('rate')}
        testID="housegains.rating.rate"
        title={t('housegains.rating.rate')}
      />
      <Button
        accessibilityLabel={t('housegains.rating.notNowA11y')}
        disabled={busy}
        onPress={() => void handleTap('notNow')}
        testID="housegains.rating.notNow"
        title={t('housegains.rating.notNow')}
        variant="ghost"
      />
    </Card>
  );
}

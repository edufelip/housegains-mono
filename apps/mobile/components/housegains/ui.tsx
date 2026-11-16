import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type ScrollViewProps,
  type StyleProp,
  type TextProps,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getThemeTokens,
  useAppearance,
  type AppearanceTokens,
  type ThemeId,
  type TypeRole,
} from '@/features/appearance';
import type { ComponentProps, ReactNode } from 'react';

type SafeAreaEdge = 'top' | 'right' | 'bottom' | 'left';

export type ScreenProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  scrollable?: boolean;
  edges?: SafeAreaEdge[];
  testID?: string;
} & Omit<ScrollViewProps, 'children' | 'style' | 'contentContainerStyle'>;

export function Screen({
  children,
  style,
  contentContainerStyle,
  scrollable = true,
  edges = ['top', 'right', 'bottom', 'left'],
  testID,
  ...scrollProps
}: ScreenProps) {
  const { tokens } = useAppearance();
  return (
    <SafeAreaView
      edges={edges}
      style={[styles.screen, { backgroundColor: tokens.canvas }, style]}
      testID={testID}
    >
      {scrollable ? (
        <ScrollView
          {...scrollProps}
          style={styles.fill}
          contentContainerStyle={[
            styles.scrollContent,
            { maxWidth: tokens.layout.maxContentWidth },
            contentContainerStyle,
          ]}
          keyboardShouldPersistTaps={scrollProps.keyboardShouldPersistTaps ?? 'handled'}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, contentContainerStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export type CardProps = ViewProps & {
  children: ReactNode;
};

export function Card({ children, style, ...viewProps }: CardProps) {
  const { tokens } = useAppearance();
  return (
    <View
      {...viewProps}
      style={[
        {
          padding: tokens.spacing.md,
          backgroundColor: tokens.surface,
          borderColor: tokens.border,
          borderRadius: tokens.radius,
          borderWidth: tokens.borderWidth,
          shadowColor: tokens.shadow.color,
          shadowOffset: tokens.shadow.offset,
          shadowOpacity: tokens.shadow.opacity,
          shadowRadius: tokens.shadow.radius,
          elevation: tokens.shadow.elevation,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';

export type ButtonProps = {
  title: string;
  onPress: PressableProps['onPress'];
  disabled?: boolean;
  variant?: ButtonVariant;
  accessibilityLabel?: string;
  themeId?: ThemeId;
  tokens?: AppearanceTokens;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function Button({
  title,
  onPress,
  disabled = false,
  variant = 'primary',
  accessibilityLabel,
  themeId,
  tokens: tokensOverride,
  style,
  testID,
}: ButtonProps) {
  const appearance = useAppearance();
  const tokens = tokensOverride ?? (themeId ? getThemeTokens(themeId) : appearance.tokens);
  const [focused, setFocused] = useState(false);
  const buttonType = tokens.type.button;
  const variantStyle: ViewStyle =
    variant === 'primary'
      ? { backgroundColor: tokens.primary, borderColor: tokens.border }
      : variant === 'secondary'
        ? { backgroundColor: tokens.surface, borderColor: tokens.border }
        : variant === 'outline'
          ? { backgroundColor: 'transparent', borderColor: tokens.primary }
          : { backgroundColor: 'transparent', borderColor: 'transparent' };
  const labelColor = variant === 'primary' ? tokens.onPrimary : tokens.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      focusable
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        {
          minHeight: tokens.touchTarget.comfortable,
          borderColor: tokens.border,
          borderRadius: tokens.radius,
          borderWidth: tokens.borderWidth,
          shadowColor: tokens.shadow.color,
          shadowOffset: tokens.shadow.offset,
          shadowOpacity: disabled ? 0 : tokens.shadow.opacity,
          shadowRadius: tokens.shadow.radius,
          elevation: disabled ? 0 : tokens.shadow.elevation,
        },
        variantStyle,
        style,
        pressed && !disabled
          ? { opacity: tokens.stateOpacity.pressed, transform: [{ scale: 0.985 }] }
          : null,
        focused ? { borderColor: tokens.accent } : null,
        disabled ? { opacity: tokens.stateOpacity.disabled } : null,
      ]}
    >
      <Text allowFontScaling style={[styles.buttonLabel, buttonType, { color: labelColor }]}>
        {title}
      </Text>
    </Pressable>
  );
}

export type LabelVariant = Exclude<TypeRole, 'button'>;

export type LabelProps = Omit<TextProps, 'children'> & {
  children: ReactNode;
  variant?: LabelVariant;
  themeId?: ThemeId;
  tokens?: AppearanceTokens;
};

export function Label({
  children,
  variant = 'body',
  themeId,
  tokens: tokensOverride,
  style,
  ...textProps
}: LabelProps) {
  const appearance = useAppearance();
  const tokens = tokensOverride ?? (themeId ? getThemeTokens(themeId) : appearance.tokens);
  const quiet = variant === 'caption' || variant === 'eyebrow';

  return (
    <Text
      allowFontScaling
      {...textProps}
      style={[
        styles.label,
        { color: quiet ? tokens.muted : tokens.text },
        tokens.type[variant],
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export type StatePanelKind = 'loading' | 'empty' | 'error' | 'demo' | 'unavailable';

export type StatePanelProps = {
  kind: StatePanelKind;
  title: string;
  description?: string;
  actionTitle?: string;
  onAction?: () => void;
  testID?: string;
};

const STATE_ICONS: Record<
  Exclude<StatePanelKind, 'loading'>,
  ComponentProps<typeof Ionicons>['name']
> = {
  empty: 'file-tray-outline',
  error: 'alert-circle-outline',
  demo: 'flask-outline',
  unavailable: 'cloud-offline-outline',
};

/**
 * The one way to show loading, empty, error, demo, and unavailable states.
 * The kind is always conveyed by an icon and the title text, never color alone.
 * An action (retry, create) renders only when both `actionTitle` and `onAction` are set.
 */
export function StatePanel({
  kind,
  title,
  description,
  actionTitle,
  onAction,
  testID,
}: StatePanelProps) {
  const { tokens } = useAppearance();
  const iconColor = kind === 'error' ? tokens.danger : tokens.primary;
  return (
    <Card
      accessibilityRole={kind === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion={kind === 'loading' ? 'polite' : undefined}
      style={{ alignItems: 'center', gap: tokens.spacing.sm }}
      testID={testID}
    >
      {kind === 'loading' ? (
        <ActivityIndicator color={iconColor} size="large" />
      ) : (
        <Ionicons
          accessibilityElementsHidden
          color={iconColor}
          importantForAccessibility="no"
          name={STATE_ICONS[kind]}
          size={tokens.iconSize.lg}
        />
      )}
      <Label style={{ textAlign: 'center' }} variant="heading">
        {title}
      </Label>
      {description ? <Label style={{ textAlign: 'center' }}>{description}</Label> : null}
      {actionTitle && onAction ? (
        <Button
          onPress={onAction}
          testID={testID ? `${testID}.action` : undefined}
          title={actionTitle}
          variant={kind === 'error' ? 'primary' : 'secondary'}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  fill: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignSelf: 'center',
    width: '100%',
  },
  button: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  buttonLabel: {
    textAlign: 'center',
    flexShrink: 1,
  },
  label: {
    flexShrink: 1,
  },
});

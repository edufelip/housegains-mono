import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type ScrollViewProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getThemeTokens, useAppearance, type ThemeId } from '@/features/appearance';
import type { ReactNode } from 'react';

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
          contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
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
        styles.card,
        {
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
  style,
  testID,
}: ButtonProps) {
  const appearance = useAppearance();
  const tokens = themeId ? getThemeTokens(themeId) : appearance.tokens;
  const [focused, setFocused] = useState(false);
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
        pressed && !disabled ? styles.buttonPressed : null,
        focused ? { borderColor: tokens.accent } : null,
        disabled ? styles.buttonDisabled : null,
      ]}
    >
      <Text
        allowFontScaling
        style={[styles.buttonLabel, { color: labelColor, fontFamily: tokens.typography.medium }]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

export type LabelVariant = 'title' | 'heading' | 'body' | 'caption' | 'eyebrow';

export type LabelProps = Omit<TextProps, 'children'> & {
  children: ReactNode;
  variant?: LabelVariant;
  themeId?: ThemeId;
};

export function Label({ children, variant = 'body', themeId, style, ...textProps }: LabelProps) {
  const appearance = useAppearance();
  const tokens = themeId ? getThemeTokens(themeId) : appearance.tokens;
  const typography: TextStyle =
    variant === 'title'
      ? { fontFamily: tokens.typography.heading, fontSize: 26, lineHeight: 32, fontWeight: '700' }
      : variant === 'heading'
        ? { fontFamily: tokens.typography.heading, fontSize: 21, lineHeight: 27, fontWeight: '700' }
        : variant === 'caption'
          ? { fontFamily: tokens.typography.body, fontSize: 13, lineHeight: 18 }
          : variant === 'eyebrow'
            ? { fontFamily: tokens.typography.medium, fontSize: 12, lineHeight: 16 }
            : { fontFamily: tokens.typography.body, fontSize: 16, lineHeight: 23 };

  return (
    <Text
      allowFontScaling
      {...textProps}
      style={[
        styles.label,
        { color: variant === 'caption' || variant === 'eyebrow' ? tokens.muted : tokens.text },
        typography,
        style,
      ]}
    >
      {children}
    </Text>
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
    maxWidth: 720,
  },
  card: {
    padding: 16,
  },
  button: {
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  buttonLabel: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    textAlign: 'center',
    flexShrink: 1,
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  buttonDisabled: {
    opacity: 0.52,
  },
  label: {
    flexShrink: 1,
  },
});

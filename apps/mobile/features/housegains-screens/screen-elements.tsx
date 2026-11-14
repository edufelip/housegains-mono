import { Ionicons } from '@expo/vector-icons';
import { Pressable, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { Card, Label } from '@/components/housegains/ui';
import { useAppearance } from '@/features/appearance';
import type { ComponentProps } from 'react';

const ICONS: Record<string, ComponentProps<typeof Ionicons>['name']> = {
  '🏠': 'home-outline',
  '🏢': 'business-outline',
  '♡': 'heart-outline',
  '🐾': 'paw-outline',
  '🐕': 'paw-outline',
  '🍃': 'leaf-outline',
  '🪴': 'leaf-outline',
  '☆': 'star-outline',
  '🍽️': 'restaurant-outline',
  '🧼': 'water-outline',
  '🛋️': 'bed-outline',
  '👕': 'shirt-outline',
  '🧺': 'basket-outline',
  '🗑️': 'trash-outline',
  '♻️': 'refresh-outline',
};

export function HouseGainsGlyph({
  icon,
  color,
  size = 22,
}: {
  icon: string;
  color?: string;
  size?: number;
}) {
  const { tokens } = useAppearance();
  return (
    <Ionicons color={color ?? tokens.text} name={ICONS[icon] ?? 'sparkles-outline'} size={size} />
  );
}

export function tokenShadowStyle(shadow: {
  color: string;
  offset: { width: number; height: number };
  opacity: number;
  radius: number;
  elevation: number;
}) {
  return {
    shadowColor: shadow.color,
    shadowOffset: shadow.offset,
    shadowOpacity: shadow.opacity,
    shadowRadius: shadow.radius,
    elevation: shadow.elevation,
  };
}

export function ScreenTitle({
  title,
  description,
  eyebrow,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
}) {
  return (
    <View style={{ gap: 6, marginBottom: 16 }}>
      {eyebrow ? <Label variant="eyebrow">{eyebrow}</Label> : null}
      <Label variant="title">{title}</Label>
      {description ? <Label variant="body">{description}</Label> : null}
    </View>
  );
}

export function FormField({
  label,
  containerStyle,
  ...inputProps
}: TextInputProps & { label: string; containerStyle?: ViewStyle }) {
  const { tokens } = useAppearance();
  return (
    <View style={[{ gap: 8 }, containerStyle]}>
      <Label variant="eyebrow">{label}</Label>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={tokens.muted}
        selectionColor={tokens.primary}
        style={{
          backgroundColor: tokens.surface,
          borderColor: tokens.border,
          borderRadius: tokens.radius,
          borderWidth: tokens.borderWidth,
          color: tokens.text,
          fontSize: 17,
          minHeight: 52,
          paddingHorizontal: 14,
          ...tokenShadowStyle(tokens.shadow),
        }}
        {...inputProps}
      />
    </View>
  );
}

export function ChoiceChip({
  title,
  selected,
  onPress,
  accessibilityLabel,
  testID,
  style,
}: {
  title: string;
  selected: boolean;
  onPress(): void;
  accessibilityLabel?: string;
  testID?: string;
  style?: ViewStyle;
}) {
  const { tokens } = useAppearance();
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? title}
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
          opacity: pressed ? 0.8 : 1,
          paddingHorizontal: 14,
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

export function MemberBadge({
  initials,
  color,
  selected = false,
  onPress,
  accessibilityLabel,
  testID,
  size = 46,
}: {
  initials: string;
  color: string;
  selected?: boolean;
  onPress?(): void;
  accessibilityLabel: string;
  testID?: string;
  size?: number;
}) {
  const { tokens } = useAppearance();
  const style = {
    alignItems: 'center' as const,
    backgroundColor: color,
    borderColor: selected ? tokens.text : 'transparent',
    borderRadius: size / 2,
    borderWidth: selected ? Math.max(2, tokens.borderWidth) : 0,
    height: size,
    justifyContent: 'center' as const,
    width: size,
  };
  if (!onPress) {
    return (
      <View accessibilityLabel={accessibilityLabel} style={style} testID={testID}>
        <Label style={{ color: '#111111', fontSize: size * 0.3, fontWeight: '800' }}>
          {initials}
        </Label>
      </View>
    );
  }
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={style}
      testID={testID}
    >
      <Label style={{ color: '#111111', fontSize: size * 0.3, fontWeight: '800' }}>
        {initials}
      </Label>
    </Pressable>
  );
}

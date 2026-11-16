import { StyleSheet, Text, View } from 'react-native';
import { ThemePreview } from '@/components/housegains/theme-preview';
import { useHouseGainsTranslation } from '@/localization/housegains';
import type { AppearanceTokens, ThemeId } from '@/features/appearance';

export const PHONE_ASPECT = 0.49; // outer width / outer height

const BEZEL_PADDING = 7;
const BEZEL_BORDER = 1.5;
const BEZEL_INSET = BEZEL_PADDING + BEZEL_BORDER;
const BASE_W = 260;

function isDarkColor(hex: string): boolean {
  const match = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!match) return false;
  const digits = match[1].length === 3 ? [...match[1]].map((c) => c + c).join('') : match[1];
  const channels = [0, 2, 4].map((offset) => parseInt(digits.slice(offset, offset + 2), 16) / 255);
  const [r, g, b] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  );
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 0.2;
}

export function PhonePreview({
  styleId,
  composition,
  tokens,
  height,
  accessibilityLabel,
}: {
  styleId: string;
  composition: ThemeId;
  tokens: AppearanceTokens;
  height: number;
  accessibilityLabel: string;
}) {
  const { t } = useHouseGainsTranslation();
  const width = Math.round(height * PHONE_ASPECT);
  const screenW = width - BEZEL_INSET * 2;
  const screenH = height - BEZEL_INSET * 2;
  const baseH = Math.round((BASE_W * screenH) / screenW);
  const statusColor = isDarkColor(tokens.canvas) ? '#F0F6FC' : '#141414';

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={[styles.bezel, { width, height }]}
    >
      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={[styles.screen, { width: screenW, height: screenH, backgroundColor: tokens.canvas }]}
      >
        <View
          style={[
            styles.baseCanvas,
            {
              width: BASE_W,
              height: baseH,
              left: (screenW - BASE_W) / 2,
              top: (screenH - baseH) / 2,
              transform: [{ scale: screenW / BASE_W }],
            },
          ]}
        >
          <ThemePreview themeId={composition} tokens={tokens} variant="phone" styleId={styleId} />
        </View>

        <View style={[styles.statusBar, { width: screenW }]}>
          <Text allowFontScaling={false} style={[styles.clock, { color: statusColor }]}>
            {t('housegains.preview.clock')}
          </Text>
          <View style={styles.statusRight}>
            <View style={[styles.signalBar, { height: 4, backgroundColor: statusColor }]} />
            <View style={[styles.signalBar, { height: 6, backgroundColor: statusColor }]} />
            <View style={[styles.battery, { borderColor: statusColor }]} />
          </View>
        </View>

        <View style={[styles.island, { left: (screenW - 50) / 2 }]} />
        <View
          style={[styles.homeIndicator, { left: (screenW - 62) / 2, backgroundColor: statusColor }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bezel: {
    backgroundColor: '#0E0E10',
    borderRadius: 34,
    padding: BEZEL_PADDING,
    borderWidth: BEZEL_BORDER,
    borderColor: '#3A3A3D',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  screen: {
    borderRadius: 27,
    overflow: 'hidden',
  },
  baseCanvas: {
    position: 'absolute',
  },
  statusBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: 24,
    zIndex: 2,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  clock: {
    fontSize: 9,
    fontFamily: 'Geist_700Bold',
  },
  statusRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  signalBar: {
    width: 3,
    borderRadius: 1,
  },
  battery: {
    width: 12,
    height: 6,
    borderWidth: 1,
    borderRadius: 2,
    marginLeft: 2,
  },
  island: {
    position: 'absolute',
    top: 6,
    width: 50,
    height: 14,
    borderRadius: 8,
    backgroundColor: '#000000',
    zIndex: 3,
  },
  homeIndicator: {
    position: 'absolute',
    bottom: 4,
    width: 62,
    height: 3,
    borderRadius: 2,
    zIndex: 3,
  },
});

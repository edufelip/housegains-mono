import { BUNDLED_PICKER_CONFIG } from '@/features/appearance/picker-config';
import { findStyleForSelection, resolvePickerStyles } from '@/features/appearance/picker-styles';
import { FontFamily } from '@/features/appearance/tokens';

function remoteWith(order: string[], disabled: string[] = []) {
  const config = structuredClone(BUNDLED_PICKER_CONFIG);
  config.styles = config.styles
    .filter((style) => order.includes(style.id) || disabled.includes(style.id))
    .map((style) => ({
      ...style,
      enabled: !disabled.includes(style.id),
      order: order.includes(style.id) ? order.indexOf(style.id) + 1 : 99,
    }));
  return resolvePickerStyles(config);
}

describe('findStyleForSelection (rule R6)', () => {
  test('a saved style hidden by the config is still used from the config', () => {
    const resolved = remoteWith(['soft', 'sticker'], ['arcade']);
    expect(resolved.visible.map((style) => style.id)).toEqual(['soft', 'sticker']);
    expect(findStyleForSelection('arcade', undefined, resolved).id).toBe('arcade');
  });

  test('an old record without composition resolves through the bundled id', () => {
    const resolved = remoteWith(['soft', 'sticker']);
    expect(findStyleForSelection('arcade', undefined, resolved).id).toBe('arcade');
  });

  test('an unknown id falls back to the bundled style with the saved composition', () => {
    const resolved = remoteWith(['soft', 'sticker']);
    expect(findStyleForSelection('midnight', 'arcade', resolved).id).toBe('arcade');
  });

  test('an unknown id without composition falls back to the first bundled style, not a remote one', () => {
    const resolved = remoteWith(['soft', 'sticker']);
    expect(findStyleForSelection('ghost', undefined, resolved).id).toBe('sticker');
  });

  test('no selection uses the first visible page of the active config', () => {
    const resolved = remoteWith(['soft', 'sticker']);
    expect(findStyleForSelection(null, undefined, resolved).id).toBe('soft');
  });
});

describe('role type scale follows the configured heading font', () => {
  test('a soft style configured with a sans heading gets sans Label headings', () => {
    const config = structuredClone(BUNDLED_PICKER_CONFIG);
    const soft = config.styles.find((style) => style.composition === 'soft');
    if (!soft) throw new Error('bundled config has no soft style');
    soft.headingFont = 'sans';
    const style = resolvePickerStyles(config).all.find((item) => item.id === soft.id);

    expect(style?.tokens.typography.heading).toBe(FontFamily.bold);
    expect(style?.tokens.type.heading.fontFamily).toBe(FontFamily.bold);
    expect(style?.tokens.type.title.fontFamily).toBe(FontFamily.bold);
  });
});

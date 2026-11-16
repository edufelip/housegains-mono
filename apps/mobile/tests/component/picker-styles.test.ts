import { BUNDLED_PICKER_CONFIG } from '@/features/appearance/picker-config';
import { findStyleForSelection, resolvePickerStyles } from '@/features/appearance/picker-styles';

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

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { loadActivatedPickerConfig, refreshPickerConfigInBackground } from './picker-config-source';
import { bundledPickerStyles, findStyleForSelection, resolvePickerStyles } from './picker-styles';
import { readAppearancePreference, writeAppearancePreference } from './storage';
import type {
  PickerConfigSource,
  PickerStyle,
  ResolvedPickerStyles,
  StyleId,
} from './picker-config-types';
import type { AppearanceTokens, ThemeId } from './types';

type AppearanceContextValue = {
  /** Composition (layout family) of the active style. Existing screens branch on this. */
  themeId: ThemeId;
  /** Id of the active style (preview, else saved, else the first picker page). */
  styleId: StyleId;
  /** Tokens of the active style (config colours over the composition's bundled tokens). */
  tokens: AppearanceTokens;
  /** Picker pages: enabled styles from the active config, in config order. */
  styles: PickerStyle[];
  /** Where the styles came from, and validation messages (for logging and QA). */
  configReport: { source: PickerConfigSource; errors: string[]; warnings: string[] };
  hydrated: boolean;
  /** Saved style id, or null when nothing has been chosen yet. */
  selected: StyleId | null;
  previewThemeId: StyleId | null;
  loadError: boolean;
  saveError: boolean;
  previewTheme: (id: StyleId) => void;
  clearPreview: () => void;
  selectTheme: (id: StyleId) => Promise<void>;
  retryLoad: () => Promise<void>;
  retrySave: () => Promise<void>;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

type AppearanceProviderProps = {
  children: ReactNode;
};

export function ThemeProvider({ children }: AppearanceProviderProps) {
  const [resolved, setResolved] = useState<ResolvedPickerStyles>(() => bundledPickerStyles());
  const [configReady, setConfigReady] = useState(false);
  const [selected, setSelected] = useState<StyleId | null>(null);
  const [selectedComposition, setSelectedComposition] = useState<ThemeId | undefined>(undefined);
  const [previewThemeId, setPreviewThemeId] = useState<StyleId | null>(null);
  const [preferenceHydrated, setPreferenceHydrated] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [pendingSave, setPendingSave] = useState<StyleId | null>(null);
  const loadGeneration = useRef(0);
  const selectionGeneration = useRef(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  // R8: read the value an earlier session activated, once, before the first themed frame.
  // A background fetch activates a newer value for the next cold start, never mid-session.
  useEffect(() => {
    let cancelled = false;
    void loadActivatedPickerConfig().then((raw) => {
      // Fetch only after this launch's value is read, so a newer value always waits for the next
      // cold start instead of racing the read.
      refreshPickerConfigInBackground();
      if (cancelled) return;
      setResolved(resolvePickerStyles(raw));
      setConfigReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const retryLoad = useCallback(async () => {
    const generation = ++loadGeneration.current;
    const selectionAtStart = selectionGeneration.current;
    setPreferenceHydrated(false);
    setLoadError(false);
    try {
      const result = await readAppearancePreference();
      if (generation !== loadGeneration.current) return;
      if (selectionAtStart !== selectionGeneration.current) return;
      if (result.status === 'present') {
        setSelected(result.themeId);
        setSelectedComposition(result.composition);
      } else {
        setSelected(null);
        setSelectedComposition(undefined);
      }
      setPendingSave(null);
      setSaveError(false);
    } catch {
      if (generation !== loadGeneration.current) return;
      setLoadError(true);
    } finally {
      if (generation === loadGeneration.current) setPreferenceHydrated(true);
    }
  }, []);

  useEffect(() => {
    void retryLoad();
    return () => {
      loadGeneration.current += 1;
    };
  }, [retryLoad]);

  const previewTheme = useCallback((id: StyleId) => {
    setPreviewThemeId(id);
  }, []);

  const clearPreview = useCallback(() => {
    setPreviewThemeId(null);
  }, []);

  const selectTheme = useCallback(
    async (id: StyleId) => {
      const generation = ++selectionGeneration.current;
      const composition = findStyleForSelection(id, undefined, resolved).composition;
      setPreviewThemeId(id);
      setPendingSave(id);
      setSaveError(false);
      const write = saveQueue.current
        .catch(() => undefined)
        .then(() => writeAppearancePreference(id, composition));
      saveQueue.current = write.catch(() => undefined);
      try {
        await write;
        if (generation !== selectionGeneration.current) {
          throw new Error('Appearance selection was superseded by a newer choice.');
        }
        setSelected(id);
        setSelectedComposition(composition);
        setPendingSave(null);
        setLoadError(false);
      } catch (error) {
        if (generation === selectionGeneration.current) setSaveError(true);
        throw error;
      }
    },
    [resolved],
  );

  const retrySave = useCallback(async () => {
    const themeToSave = previewThemeId ?? pendingSave;
    if (!themeToSave) return;
    await selectTheme(themeToSave);
  }, [pendingSave, previewThemeId, selectTheme]);

  const activeId = previewThemeId ?? selected;
  const activeStyle = useMemo(
    () =>
      findStyleForSelection(
        activeId,
        activeId !== null && activeId === selected ? selectedComposition : undefined,
        resolved,
      ),
    [activeId, resolved, selected, selectedComposition],
  );
  const hydrated = preferenceHydrated && configReady;

  const value = useMemo<AppearanceContextValue>(
    () => ({
      themeId: activeStyle.composition,
      styleId: activeStyle.id,
      tokens: activeStyle.tokens,
      styles: resolved.visible,
      configReport: {
        source: resolved.source,
        errors: resolved.errors,
        warnings: resolved.warnings,
      },
      hydrated,
      selected,
      previewThemeId,
      loadError,
      saveError,
      previewTheme,
      clearPreview,
      selectTheme,
      retryLoad,
      retrySave,
    }),
    [
      activeStyle,
      resolved,
      hydrated,
      selected,
      previewThemeId,
      loadError,
      saveError,
      previewTheme,
      clearPreview,
      selectTheme,
      retryLoad,
      retrySave,
    ],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceContextValue {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error('useAppearance must be used within ThemeProvider.');
  return context;
}

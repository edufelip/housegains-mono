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
import { readAppearancePreference, writeAppearancePreference } from './storage';
import { getThemeTokens } from './tokens';
import type { AppearanceTokens, ThemeId } from './types';

type AppearanceContextValue = {
  themeId: ThemeId;
  tokens: AppearanceTokens;
  hydrated: boolean;
  selected: ThemeId | null;
  previewThemeId: ThemeId | null;
  loadError: boolean;
  saveError: boolean;
  previewTheme: (id: ThemeId) => void;
  clearPreview: () => void;
  selectTheme: (id: ThemeId) => Promise<void>;
  retryLoad: () => Promise<void>;
  retrySave: () => Promise<void>;
};

const FALLBACK_THEME: ThemeId = 'arcade';
const AppearanceContext = createContext<AppearanceContextValue | null>(null);

type AppearanceProviderProps = {
  children: ReactNode;
};

export function ThemeProvider({ children }: AppearanceProviderProps) {
  const [selected, setSelected] = useState<ThemeId | null>(null);
  const [previewThemeId, setPreviewThemeId] = useState<ThemeId | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [pendingSave, setPendingSave] = useState<ThemeId | null>(null);
  const loadGeneration = useRef(0);
  const selectionGeneration = useRef(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  const retryLoad = useCallback(async () => {
    const generation = ++loadGeneration.current;
    const selectionAtStart = selectionGeneration.current;
    setHydrated(false);
    setLoadError(false);
    try {
      const result = await readAppearancePreference();
      if (generation !== loadGeneration.current) return;
      if (selectionAtStart !== selectionGeneration.current) return;
      setSelected(result.status === 'present' ? result.themeId : null);
      setPendingSave(null);
      setSaveError(false);
    } catch {
      if (generation !== loadGeneration.current) return;
      setLoadError(true);
    } finally {
      if (generation === loadGeneration.current) setHydrated(true);
    }
  }, []);

  useEffect(() => {
    void retryLoad();
    return () => {
      loadGeneration.current += 1;
    };
  }, [retryLoad]);

  const previewTheme = useCallback((id: ThemeId) => {
    setPreviewThemeId(id);
  }, []);

  const clearPreview = useCallback(() => {
    setPreviewThemeId(null);
  }, []);

  const selectTheme = useCallback(async (id: ThemeId) => {
    const generation = ++selectionGeneration.current;
    setPreviewThemeId(id);
    setPendingSave(id);
    setSaveError(false);
    const write = saveQueue.current
      .catch(() => undefined)
      .then(() => writeAppearancePreference(id));
    saveQueue.current = write.catch(() => undefined);
    try {
      await write;
      if (generation !== selectionGeneration.current) {
        throw new Error('Appearance selection was superseded by a newer choice.');
      }
      setSelected(id);
      setPendingSave(null);
      setLoadError(false);
    } catch (error) {
      if (generation === selectionGeneration.current) setSaveError(true);
      throw error;
    }
  }, []);

  const retrySave = useCallback(async () => {
    const themeToSave = previewThemeId ?? pendingSave;
    if (!themeToSave) return;
    await selectTheme(themeToSave);
  }, [pendingSave, previewThemeId, selectTheme]);

  const themeId = previewThemeId ?? selected ?? FALLBACK_THEME;
  const value = useMemo<AppearanceContextValue>(
    () => ({
      themeId,
      tokens: getThemeTokens(themeId),
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
      themeId,
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

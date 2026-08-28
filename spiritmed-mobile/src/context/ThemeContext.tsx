import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark';

export interface ThemeColors {
  mode: ThemeMode;
  bg: string;
  cardBg: string;
  text: string;
  subText: string;
  border: string;
  inputBg: string;
  inputBorder: string;
  accent: string;
  accentBg: string;
  statusBar: 'dark-content' | 'light-content';
}

export const lightColors: ThemeColors = {
  mode: 'light',
  bg: '#FFFFFF',
  cardBg: '#F9FAFB',
  text: '#111827',
  subText: '#6B7280',
  border: '#E5E7EB',
  inputBg: '#FFFFFF',
  inputBorder: '#D1D5DB',
  accent: '#00A859',
  accentBg: '#ECFDF5',
  statusBar: 'dark-content',
};

export const darkColors: ThemeColors = {
  mode: 'dark',
  bg: '#0F172A',
  cardBg: '#1E293B',
  text: '#FFFFFF',
  subText: '#94A3B8',
  border: '#334155',
  inputBg: '#0F172A',
  inputBorder: '#334155',
  accent: '#10B981',
  accentBg: '#064E3B',
  statusBar: 'light-content',
};

interface ThemeContextType {
  theme: ThemeMode;
  isDark: boolean;
  themeColors: ThemeColors;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  isDark: false,
  themeColors: lightColors,
  toggleTheme: () => {},
  setThemeMode: () => {},
});

const THEME_STORAGE_KEY = '@spiritmed_app_theme';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<ThemeMode>('light');

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((savedTheme) => {
      if (savedTheme === 'dark' || savedTheme === 'light') {
        setTheme(savedTheme);
      }
    }).catch(() => {});
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    AsyncStorage.setItem(THEME_STORAGE_KEY, nextTheme).catch(() => {});
  };

  const setThemeMode = (mode: ThemeMode) => {
    setTheme(mode);
    AsyncStorage.setItem(THEME_STORAGE_KEY, mode).catch(() => {});
  };

  const themeColors = theme === 'dark' ? darkColors : lightColors;

  return (
    <ThemeContext.Provider
      value={{
        theme,
        isDark: theme === 'dark',
        themeColors,
        toggleTheme,
        setThemeMode,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

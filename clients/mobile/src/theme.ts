import { useColorScheme } from 'react-native';

const light = {
  red: '#c1272d', green: '#006233', bg: '#f7f5f2', card: '#ffffff', text: '#1d1b19',
  muted: '#6b6560', line: '#e4dfd8', errorBg: '#fdecec', ok: '#1f8a4c',
};
const dark: typeof light = {
  red: '#e0474d', green: '#1f8f58', bg: '#171514', card: '#221f1d', text: '#f1ece6',
  muted: '#a59d95', line: '#36312d', errorBg: '#3a1d1d', ok: '#4cc27f',
};
export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

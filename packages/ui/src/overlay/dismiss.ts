import { Platform } from 'react-native';

/** iOS cannot present an alert while a menu's modal is still closing: run the action after it. */
export const MENU_DISMISS_MS = Platform.OS === 'ios' ? 300 : 0;

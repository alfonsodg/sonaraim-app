/**
 * @fileoverview Root entrypoint for Sonaraim React Native (Expo) Mobile Application.
 * Configures application-wide status bar and mounts the main navigation AppShell.
 */

import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppShell } from './src/AppShell.js';

/**
 * Root Sonaraim mobile application component.
 *
 * @returns {React.ReactElement} Root application tree.
 */
export default function App() {
  return (
    <>
      <StatusBar style="light" backgroundColor="#090d16" />
      <AppShell />
    </>
  );
}

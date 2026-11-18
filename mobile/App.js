/**
 * @fileoverview Root entrypoint for Sonaraim React Native (Expo) Mobile Application.
 * Installs the vetted WebCrypto polyfill ONCE (issue #29, owner Option C) before
 * mounting the navigation AppShell, then configures the status bar.
 */

import { installCryptoPolyfill, loadQuickCryptoModule } from './cryptoPolyfill.js';

loadQuickCryptoModule().then((quickCryptoModule) => {
  installCryptoPolyfill({ installModule: quickCryptoModule });
});

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

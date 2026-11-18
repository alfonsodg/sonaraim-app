/**
 * @fileoverview Root entrypoint for Sonaraim React Native (Expo) Mobile Application.
 * Installs the vetted WebCrypto polyfill ONCE (issue #29, owner Option C),
 * wires the root notification handler (issue #31: foreground/background +
 * permission flow + `sonaraim://` deep links), then mounts AppShell.
 */

import { installCryptoPolyfill, loadQuickCryptoModule } from './cryptoPolyfill.js';

loadQuickCryptoModule().then((quickCryptoModule) => {
  installCryptoPolyfill({ installModule: quickCryptoModule });
});

import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppShell } from './src/AppShell.js';
import { setupNotificationHandler } from './src/notificationHandler.js';

/**
 * Root Sonaraim mobile application component.
 *
 * @returns {React.ReactElement} Root application tree.
 */
export default function App() {
  const [initialTab, setInitialTab] = useState('inbox');
  const [pushToken, setPushToken] = useState(null);

  useEffect(() => {
    let teardown = null;
    let cancelled = false;
    setupNotificationHandler({
      onDeepLink: (route) => {
        if (!cancelled && route?.tab) {
          setInitialTab(route.tab);
        }
      },
    })
      .then(({ teardown: stop, pushToken: token }) => {
        if (cancelled) {
          stop();
          return;
        }
        teardown = stop;
        setPushToken(token);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (typeof teardown === 'function') {
        teardown();
      }
    };
  }, []);

  return (
    <>
      <StatusBar style="light" backgroundColor="#090d16" />
      <AppShell initialTab={initialTab} pushToken={pushToken} />
    </>
  );
}

/**
 * @fileoverview Main Application Shell for Sonaraim React Native Mobile.
 * Wires bottom navigation tabs (`Inbox`, `Groups`, `Status`, `Calls`, `Pairing`) and identity state.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { InboxScreen } from './screens/InboxScreen.js';
import { GroupsScreen } from './screens/GroupsScreen.js';
import { StatusScreen } from './screens/StatusScreen.js';
import { CallsScreen } from './screens/CallsScreen.js';
import { ActivationScreen } from './screens/ActivationScreen.js';

/**
 * Available navigation tabs.
 * @type {ReadonlyArray<{ id: 'inbox' | 'groups' | 'status' | 'calls' | 'activation', label: string }>}
 */
export const TABS = Object.freeze([
  { id: 'inbox', label: 'Inbox' },
  { id: 'groups', label: 'Groups' },
  { id: 'status', label: 'Status' },
  { id: 'calls', label: 'Calls' },
  { id: 'activation', label: 'Pairing' },
]);

/**
 * Root mobile application shell rendering top header, screen content, and bottom tab navigation.
 *
 * @param {{
 *   initialTab?: 'inbox' | 'groups' | 'status' | 'calls' | 'activation',
 *   initialDid?: string
 * }} [props]
 * @returns {React.ReactElement} AppShell component.
 */
export function AppShell({
  initialTab = 'inbox',
  initialDid = 'did:sonaraim:mobile-user',
} = {}) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [userDid, setUserDid] = useState(initialDid);

  /**
   * Callback invoked when a new phone identity is activated.
   *
   * @param {string} newDid - Activated user DID.
   */
  function handleIdentityActivated(newDid) {
    if (newDid) {
      setUserDid(newDid);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.logoText}>SONARAIM</Text>
          <Text style={styles.statusSubtitle}>Zero-Knowledge Encrypted</Text>
        </View>
        <View style={styles.didBadge}>
          <Text style={styles.didLabel}>DID</Text>
          <Text style={styles.didValue} numberOfLines={1}>
            {userDid.length > 20 ? `${userDid.slice(0, 18)}...` : userDid}
          </Text>
        </View>
      </View>

      {/* Screen Body */}
      <View style={styles.screenContainer}>
        {activeTab === 'inbox' ? (
          <InboxScreen currentUserDid={userDid} />
        ) : activeTab === 'groups' ? (
          <GroupsScreen currentUserDid={userDid} />
        ) : activeTab === 'status' ? (
          <StatusScreen currentUserDid={userDid} />
        ) : activeTab === 'calls' ? (
          <CallsScreen currentUserDid={userDid} />
        ) : (
          <ActivationScreen onIdentityActivated={handleIdentityActivated} />
        )}
      </View>

      {/* Bottom Navigation Tab Bar */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tabButton, isActive && styles.tabButtonActive]}
              onPress={() => setActiveTab(tab.id)}
            >
              <Text style={[styles.tabButtonText, isActive && styles.tabButtonTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#090d16',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    backgroundColor: '#0b1120',
  },
  logoText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#38bdf8',
    letterSpacing: 2,
  },
  statusSubtitle: {
    fontSize: 10,
    color: '#10b981',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  didBadge: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    maxWidth: 160,
  },
  didLabel: {
    fontSize: 9,
    color: '#94a3b8',
    fontWeight: '700',
  },
  didValue: {
    fontSize: 11,
    color: '#f8fafc',
    fontWeight: '600',
  },
  screenContainer: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#0b1120',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: '#1e293b',
  },
  tabButtonText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: '#38bdf8',
    fontWeight: '700',
  },
});

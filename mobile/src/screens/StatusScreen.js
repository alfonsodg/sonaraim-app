/**
 * @fileoverview 24h Ephemeral Status/Stories and Silent Push Registration Screen.
 * Allows publishing encrypted 24h statuses and registering blind wake-up push tokens.
 */

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { apiClient } from '../apiClient.js';
import {
  createStatusItem,
  filterActiveStatuses,
  deriveBlindPushToken,
  registerPushToken,
} from '../statusStore.js';
import { statusStyles as styles } from '../styles/statusStyles.js';

/**
 * Screen component for 24h Status/Stories and Silent Push notification management.
 *
 * @param {{
 *   currentUserDid?: string,
 *   initialStatuses?: Array<Record<string, any>>
 * }} [props]
 * @returns {React.ReactElement}
 */
export function StatusScreen({
  currentUserDid = 'did:sonaraim:mobile-user',
  initialStatuses = [],
} = {}) {
  const [statuses, setStatuses] = useState(() => {
    if (initialStatuses.length > 0) return initialStatuses;
    const now = Date.now();
    return [
      createStatusItem({
        authorDid: 'did:sonaraim:+14155550199',
        text: 'Exploring zero-knowledge messaging on Sonaraim mobile! 🚀',
        timestamp: now - 3600 * 1000,
      }),
    ];
  });

  const [statusText, setStatusText] = useState('');
  const [pushRegistered, setPushRegistered] = useState(false);
  const [registeredToken, setRegisteredToken] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const activeStatuses = filterActiveStatuses(statuses);

  /**
   * Publishes a new 24h ephemeral encrypted status.
   */
  function handlePublishStatus() {
    if (!statusText.trim()) {
      setError('Status text cannot be empty');
      return;
    }
    setError('');
    const newStatus = createStatusItem({
      authorDid: currentUserDid,
      text: statusText.trim(),
    });
    setStatuses((prev) => [newStatus, ...prev]);
    setStatusText('');
    setFeedback('Status published (active for 24 hours)');
  }

  /**
   * Registers a blind push wake token with the node relay.
   */
  async function handleRegisterPush() {
    setError('');
    try {
      const nowSecs = Math.floor(Date.now() / 1000);
      const blindToken = await deriveBlindPushToken(currentUserDid, 'reg-wake', nowSecs);
      await registerPushToken({
        nodeApiUrl: apiClient.config.nodeApiUrl,
        userDid: currentUserDid,
        pushToken: blindToken,
        platform: 'expo',
      });
      setPushRegistered(true);
      setRegisteredToken(blindToken);
      setFeedback('Silent push wake token registered with Sonaraim relay');
    } catch (err) {
      setError(err.message || 'Push registration failed');
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Status & Stories</Text>
      </View>
      <Text style={styles.headerSubtitle}>
        24-hour expiring encrypted updates and silent wake-up notification management.
      </Text>

      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
      {feedback ? <Text style={styles.feedbackBanner}>{feedback}</Text> : null}

      {/* Publish Status Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Publish 24h Status</Text>
        <TextInput
          style={styles.input}
          placeholder="What's happening? (expires in 24h)"
          placeholderTextColor="#64748b"
          value={statusText}
          onChangeText={setStatusText}
        />
        <TouchableOpacity style={styles.primaryBtn} onPress={handlePublishStatus}>
          <Text style={styles.primaryBtnText}>Publish Status</Text>
        </TouchableOpacity>
      </View>

      {/* Silent Push Wake-Up Card */}
      <View style={styles.pushCard}>
        <Text style={styles.cardTitle}>Silent Wake-Up Notifications</Text>
        <View style={styles.pushStatusRow}>
          <View style={[styles.pushDot, !pushRegistered && { backgroundColor: '#f59e0b' }]} />
          <Text style={styles.pushStatusText}>
            {pushRegistered ? 'Silent Push Registered (Zero-Metadata)' : 'Push Wake Not Registered'}
          </Text>
        </View>
        {registeredToken ? (
          <Text style={[styles.statusExpires, { marginBottom: 8, color: '#38bdf8' }]} numberOfLines={1}>
            Blind Token: {registeredToken}
          </Text>
        ) : null}
        <TouchableOpacity style={styles.primaryBtn} onPress={handleRegisterPush}>
          <Text style={styles.primaryBtnText}>
            {pushRegistered ? 'Refresh Push Registration' : 'Register Silent Push Token'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Active 24h Statuses */}
      <Text style={[styles.cardTitle, { marginBottom: 8 }]}>
        Recent Status Updates ({activeStatuses.length})
      </Text>
      {activeStatuses.map((st) => {
        const remainingHours = Math.max(0, Math.round((st.expiresAt - Date.now()) / 3600000));
        return (
          <View key={st.id} style={styles.statusItem}>
            <View style={styles.statusHeader}>
              <Text style={styles.statusAuthor}>{st.authorDid}</Text>
              <Text style={styles.statusExpires}>{remainingHours}h remaining</Text>
            </View>
            <Text style={styles.statusText}>{st.text}</Text>
            {st.mediaPointer ? (
              <View style={styles.mediaBadge}>
                <Text style={styles.mediaBadgeText}>📎 {st.mediaPointer.fileName || 'Attachment'}</Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

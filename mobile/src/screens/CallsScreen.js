/**
 * @fileoverview LiveKit Encrypted Calling Screen for Sonaraim Mobile.
 * Fetches cryptographic call room tokens, provides embedded WebRTC in-app controls,
 * and launches external LiveKit Meet sessions.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { apiClient, buildLiveKitJoinUrl } from '../apiClient.js';
import {
  CallControls,
  initialCallControlsState,
  resolveCallControlAction,
} from '../components/CallControls.js';
import { callsStyles as styles } from '../styles/callsStyles.js';

/**
 * Screen component for creating and joining encrypted LiveKit voice/video call rooms.
 *
 * @param {{
 *   currentUserDid?: string,
 *   initialRoomName?: string
 * }} [props]
 * @returns {React.ReactElement} Rendered Calls screen.
 */
export function CallsScreen({
  currentUserDid = 'did:sonaraim:mobile-caller',
  initialRoomName = 'sonaraim-secure-room',
} = {}) {
  const [roomName, setRoomName] = useState(initialRoomName);
  const [participantDid, setParticipantDid] = useState(currentUserDid);
  const [callSession, setCallSession] = useState(null);
  const [callState, setCallState] = useState('idle'); // idle | connecting | connected | ended
  const [controlsState, setControlsState] = useState(initialCallControlsState());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  /**
   * Requests a LiveKit room token and establishes call session state.
   */
  async function handleLaunchCall() {
    if (!roomName.trim()) {
      setError('Room name cannot be empty');
      return;
    }
    setLoading(true);
    setError('');
    setCallState('connecting');
    try {
      const descriptor = await apiClient.fetchCallToken({
        roomName: roomName.trim(),
        participantDid: participantDid.trim() || currentUserDid,
      });
      setCallSession(descriptor);
      setCallState('connected');
    } catch (err) {
      setError(err.message || 'Failed to acquire call token');
      setCallState('idle');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Opens the LiveKit video/audio room in the external LiveKit Meet / WebRTC client.
   */
  async function handleOpenVideoRoom() {
    if (!callSession?.serverUrl || !callSession?.token) {
      setError('Call token not ready');
      return;
    }
    try {
      const joinUrl = buildLiveKitJoinUrl({
        serverUrl: callSession.serverUrl,
        token: callSession.token,
        roomName: callSession.roomName,
      });
      await Linking.openURL(joinUrl);
    } catch (err) {
      setError(err.message || 'Unable to open LiveKit video room');
    }
  }

  /**
   * Handles in-app WebRTC control toggling.
   *
   * @param {'toggle_mute' | 'toggle_camera' | 'switch_camera' | 'toggle_speaker'} action
   */
  function handleControlAction(action) {
    setControlsState((prev) => resolveCallControlAction(prev, action));
  }

  /**
   * Terminates the active call session.
   */
  function handleEndCall() {
    setCallState('ended');
    setCallSession(null);
    setControlsState(initialCallControlsState());
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.headerTitle}>LiveKit Encrypted Calling</Text>
      <Text style={styles.subtitle}>
        End-to-end encrypted audio and video rooms authenticated by Sonaraim DIDs.
      </Text>

      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

      {/* Call Setup Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Call Room Configuration</Text>
        <Text style={styles.label}>Room Name</Text>
        <TextInput
          style={styles.input}
          placeholder="sonaraim-secure-room"
          placeholderTextColor="#64748b"
          value={roomName}
          onChangeText={setRoomName}
          editable={callState === 'idle' || callState === 'ended'}
        />

        <Text style={styles.label}>Participant Identity (DID)</Text>
        <TextInput
          style={styles.input}
          placeholder="did:sonaraim:mobile-caller"
          placeholderTextColor="#64748b"
          value={participantDid}
          onChangeText={setParticipantDid}
          editable={callState === 'idle' || callState === 'ended'}
        />

        {callState === 'idle' || callState === 'ended' ? (
          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.buttonDisabled]}
            disabled={loading}
            onPress={handleLaunchCall}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Launch Encrypted Room</Text>
            )}
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Active Call Session Card */}
      {callState === 'connected' && callSession ? (
        <View style={styles.activeCallCard}>
          <View style={styles.statusRow}>
            <View style={styles.liveDot} />
            <Text style={styles.statusText}>ENCRYPTED CALL IN PROGRESS</Text>
          </View>

          <View style={styles.sessionDetails}>
            <Text style={styles.detailLabel}>Room:</Text>
            <Text style={styles.detailValue}>{callSession.roomName}</Text>

            <Text style={styles.detailLabel}>Participant:</Text>
            <Text style={styles.detailValue}>{callSession.participantDid}</Text>

            <Text style={styles.detailLabel}>Server URL:</Text>
            <Text style={styles.detailValue}>{callSession.serverUrl}</Text>

            <Text style={styles.detailLabel}>Token (LiveKit JWT):</Text>
            <Text style={styles.tokenBox} numberOfLines={2}>
              {callSession.token ? `${callSession.token.slice(0, 32)}...` : 'N/A'}
            </Text>
          </View>

          {/* Embedded WebRTC In-App Room Controls */}
          <CallControls
            controlsState={controlsState}
            onAction={handleControlAction}
            onEndCall={handleEndCall}
          />

          {/* Fallback to external Meet room */}
          <TouchableOpacity
            style={[styles.primaryButton, { marginTop: 12 }]}
            onPress={handleOpenVideoRoom}
          >
            <Text style={styles.buttonText}>Open Video Room (LiveKit Meet)</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {callState === 'ended' ? (
        <View style={styles.endedBox}>
          <Text style={styles.endedText}>Call session concluded.</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

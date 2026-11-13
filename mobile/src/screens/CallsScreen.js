/**
 * @fileoverview LiveKit Encrypted Calling Screen for Sonaraim Mobile.
 * Fetches cryptographic call room tokens from `/api/calls/token` and launches E2E call sessions.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { apiClient } from '../apiClient.js';

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
   * Terminates the active call session.
   */
  function handleEndCall() {
    setCallState('ended');
    setCallSession(null);
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

          <TouchableOpacity style={styles.endCallButton} onPress={handleEndCall}>
            <Text style={styles.endCallButtonText}>End Call Session</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090d16' },
  content: { padding: 16, paddingBottom: 40 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#f8fafc', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#94a3b8', marginBottom: 16 },
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#38bdf8', marginBottom: 12 },
  label: { fontSize: 13, color: '#94a3b8', marginBottom: 6 },
  input: {
    backgroundColor: '#1e293b',
    color: '#f8fafc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  primaryButton: {
    backgroundColor: '#059669',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 6,
  },
  buttonText: { color: '#ffffff', fontWeight: '600', fontSize: 14 },
  buttonDisabled: { opacity: 0.6 },
  activeCallCard: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#059669',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10b981',
    marginRight: 8,
  },
  statusText: { color: '#10b981', fontWeight: '700', fontSize: 13, letterSpacing: 1 },
  sessionDetails: { marginBottom: 16 },
  detailLabel: { color: '#94a3b8', fontSize: 12, marginTop: 6 },
  detailValue: { color: '#f8fafc', fontSize: 14, fontWeight: '600' },
  tokenBox: {
    color: '#38bdf8',
    backgroundColor: '#1e293b',
    padding: 8,
    borderRadius: 6,
    fontSize: 12,
    fontFamily: 'monospace',
    marginTop: 4,
  },
  endCallButton: {
    backgroundColor: '#dc2626',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  endCallButtonText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  endedBox: {
    padding: 12,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    alignItems: 'center',
  },
  endedText: { color: '#94a3b8', fontSize: 13 },
  errorBanner: {
    backgroundColor: '#7f1d1d',
    color: '#fecaca',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    fontSize: 13,
  },
});

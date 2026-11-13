/**
 * @fileoverview WebRTC in-app call controls for `@livekit/react-native` and external Meet fallback.
 * Provides controls for mute/unmute, camera toggle, camera flip, and speakerphone.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import {
  initialCallControlsState,
  resolveCallControlAction,
} from '../callControlsLogic.js';

export { initialCallControlsState, resolveCallControlAction };

/**
 * React Native component rendering in-app WebRTC call control toolbar.
 *
 * @param {{
 *   controlsState: ReturnType<typeof initialCallControlsState>,
 *   onAction: (action: 'toggle_mute' | 'toggle_camera' | 'switch_camera' | 'toggle_speaker') => void,
 *   onEndCall?: () => void
 * }} props
 * @returns {React.ReactElement}
 */
export function CallControls({ controlsState, onAction, onEndCall }) {
  const { isMuted, isCameraOn, cameraFacing, isSpeakerOn } = controlsState;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>In-App WebRTC Controls</Text>
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.button, isMuted && styles.buttonActive]}
          onPress={() => onAction('toggle_mute')}
        >
          <Text style={styles.buttonLabel}>{isMuted ? '🔇 Unmute' : '🎙️ Mute'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, !isCameraOn && styles.buttonActive]}
          onPress={() => onAction('toggle_camera')}
        >
          <Text style={styles.buttonLabel}>{isCameraOn ? '📹 Cam Off' : '📷 Cam On'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={() => onAction('switch_camera')}
        >
          <Text style={styles.buttonLabel}>🔄 {cameraFacing === 'front' ? 'Rear' : 'Front'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, isSpeakerOn && styles.buttonActive]}
          onPress={() => onAction('toggle_speaker')}
        >
          <Text style={styles.buttonLabel}>{isSpeakerOn ? '🔊 Speaker' : '🔈 Ear'}</Text>
        </TouchableOpacity>
      </View>
      {onEndCall ? (
        <TouchableOpacity style={styles.endButton} onPress={onEndCall}>
          <Text style={styles.endButtonLabel}>Hang Up</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1e293b',
    padding: 12,
    borderRadius: 10,
    marginTop: 12,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    color: '#38bdf8',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    flex: 1,
    backgroundColor: '#0f172a',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 6,
    marginHorizontal: 3,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  buttonActive: {
    backgroundColor: '#b91c1c',
    borderColor: '#ef4444',
  },
  buttonLabel: {
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '600',
  },
  endButton: {
    backgroundColor: '#dc2626',
    marginTop: 10,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  endButtonLabel: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
});

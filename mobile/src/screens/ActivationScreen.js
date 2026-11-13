/**
 * @fileoverview Phone Identity Activation and Companion Device Pairing Screen.
 * Provides E.164 phone number registration and 6-digit / QR companion linking for Sonaraim Mobile.
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
 * Screen component for activating phone identity and managing companion device pairing sessions.
 *
 * @param {{
 *   onIdentityActivated?: (did: string) => void,
 *   initialPhone?: string
 * }} [props]
 * @returns {React.ReactElement} Rendered Activation & Pairing screen.
 */
export function ActivationScreen({ onIdentityActivated, initialPhone = '' } = {}) {
  const [phone, setPhone] = useState(initialPhone);
  const [userDid, setUserDid] = useState('');
  const [blindedToken, setBlindedToken] = useState('');
  const [pairingSession, setPairingSession] = useState(null);
  const [companionCode, setCompanionCode] = useState('');
  const [pairedDeviceStatus, setPairedDeviceStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  /**
   * Submits phone number to register E.164 phone identity.
   */
  async function handleActivatePhone() {
    if (!phone.trim()) {
      setError('Please enter a valid phone number');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await apiClient.registerPhone(phone.trim());
      setUserDid(res.userDid);
      setBlindedToken(res.blindedToken || '');
      setMessage(`Identity activated: ${res.userDid}`);
      if (typeof onIdentityActivated === 'function') {
        onIdentityActivated(res.userDid);
      }
    } catch (err) {
      setError(err.message || 'Activation failed');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Generates a new 6-digit companion device pairing code and QR URI.
   */
  async function handleGeneratePairing() {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const activeDid = userDid || 'did:sonaraim:mobile-user';
      const session = await apiClient.createPairingSession(activeDid);
      setPairingSession(session);
      setMessage(`Pairing code generated: ${session.pairingCode}`);
    } catch (err) {
      setError(err.message || 'Pairing generation failed');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Redeems and validates a companion device pairing code.
   */
  async function handleVerifyCompanionCode() {
    if (!companionCode.trim()) {
      setError('Enter a 6-digit pairing code to verify');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await apiClient.verifyPairingCode(companionCode.trim());
      setPairedDeviceStatus(`Linked to ${res.userDid} at ${new Date(res.pairedAt).toLocaleTimeString()}`);
      setMessage('Companion device successfully paired!');
      setCompanionCode('');
    } catch (err) {
      setError(err.message || 'Companion pairing verification failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.headerTitle}>Activation & Device Pairing</Text>
      <Text style={styles.subtitle}>
        Register your E.164 phone number and link desktop or web companion clients.
      </Text>

      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
      {message ? <Text style={styles.messageBanner}>{message}</Text> : null}

      {/* Step 1: E.164 Phone Activation */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>1. E.164 Phone Activation</Text>
        <Text style={styles.label}>Phone Number (International format)</Text>
        <TextInput
          style={styles.input}
          placeholder="+1 (415) 555-2671"
          placeholderTextColor="#64748b"
          keyboardType="phone-pad"
          autoCapitalize="none"
          value={phone}
          onChangeText={setPhone}
        />
        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.buttonDisabled]}
          disabled={loading}
          onPress={handleActivatePhone}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Activate Phone Identity</Text>
          )}
        </TouchableOpacity>

        {userDid ? (
          <View style={styles.badgeContainer}>
            <Text style={styles.badgeLabel}>Active DID:</Text>
            <Text style={styles.badgeValue}>{userDid}</Text>
            {blindedToken ? (
              <Text style={styles.tokenPreview}>
                Blinded Token: {blindedToken.slice(0, 16)}...
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Step 2: Companion Device Pairing */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>2. Companion Device Pairing</Text>
        <Text style={styles.label}>Generate a 6-digit code or QR URI for Desktop / Web</Text>
        <TouchableOpacity
          style={styles.secondaryButton}
          disabled={loading}
          onPress={handleGeneratePairing}
        >
          <Text style={styles.secondaryButtonText}>Generate Pairing Code / QR URI</Text>
        </TouchableOpacity>

        {pairingSession ? (
          <View style={styles.sessionBox}>
            <Text style={styles.codeText}>{pairingSession.pairingCode}</Text>
            <Text style={styles.uriLabel}>QR Companion URI:</Text>
            <Text style={styles.uriText} numberOfLines={2}>
              {pairingSession.pairingUri}
            </Text>
            <Text style={styles.expiryText}>Expires: {pairingSession.expiresAt}</Text>
          </View>
        ) : null}

        <View style={styles.divider} />

        <Text style={styles.label}>Verify / Redeem Companion Code</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter 6-digit code (e.g. 123456)"
          placeholderTextColor="#64748b"
          keyboardType="number-pad"
          maxLength={6}
          value={companionCode}
          onChangeText={setCompanionCode}
        />
        <TouchableOpacity
          style={styles.accentButton}
          disabled={loading}
          onPress={handleVerifyCompanionCode}
        >
          <Text style={styles.buttonText}>Verify Companion Code</Text>
        </TouchableOpacity>

        {pairedDeviceStatus ? (
          <Text style={styles.successBadge}>✓ {pairedDeviceStatus}</Text>
        ) : null}
      </View>
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
    fontSize: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  primaryButton: {
    backgroundColor: '#0284c7',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: '#1e293b',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#38bdf8',
    marginBottom: 10,
  },
  secondaryButtonText: { color: '#38bdf8', fontWeight: '600', fontSize: 14 },
  accentButton: {
    backgroundColor: '#059669',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: { color: '#ffffff', fontWeight: '600', fontSize: 14 },
  buttonDisabled: { opacity: 0.6 },
  badgeContainer: {
    marginTop: 12,
    padding: 10,
    backgroundColor: '#1e293b',
    borderRadius: 8,
  },
  badgeLabel: { fontSize: 12, color: '#38bdf8', fontWeight: '600' },
  badgeValue: { fontSize: 14, color: '#f8fafc', fontWeight: 'bold' },
  tokenPreview: { fontSize: 11, color: '#94a3b8', marginTop: 4 },
  sessionBox: {
    backgroundColor: '#1e293b',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: 10,
  },
  codeText: { fontSize: 28, fontWeight: '800', color: '#38bdf8', letterSpacing: 4 },
  uriLabel: { fontSize: 11, color: '#94a3b8', marginTop: 6 },
  uriText: { fontSize: 12, color: '#cbd5e1', textAlign: 'center' },
  expiryText: { fontSize: 11, color: '#64748b', marginTop: 4 },
  divider: { height: 1, backgroundColor: '#334155', marginVertical: 14 },
  errorBanner: {
    backgroundColor: '#7f1d1d',
    color: '#fecaca',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    fontSize: 13,
  },
  messageBanner: {
    backgroundColor: '#064e3b',
    color: '#a7f3d0',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    fontSize: 13,
  },
  successBadge: { color: '#34d399', fontSize: 13, marginTop: 8, fontWeight: '600' },
});

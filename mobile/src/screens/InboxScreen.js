/**
 * @fileoverview Dual Inbox Screen for Sonaraim Mobile.
 * Segregates incoming traffic into Personal P2P and Verified Services streams,
 * rendering Zero-HTML Declarative Cards with interactive action triggers.
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
import { validateDeclarativeCard } from '../cardValidator.js';

/**
 * Screen component providing Dual Inbox streams and secure message composition.
 *
 * @param {{
 *   currentUserDid?: string,
 *   initialPersonalMessages?: Array<any>,
 *   initialServiceCards?: Array<any>
 * }} [props]
 * @returns {React.ReactElement} Rendered Dual Inbox screen.
 */
export function InboxScreen({
  currentUserDid = 'did:sonaraim:mobile-user',
  initialPersonalMessages = [],
  initialServiceCards = [],
} = {}) {
  const [activeStream, setActiveStream] = useState('personal');
  const [personalMessages, setPersonalMessages] = useState(
    initialPersonalMessages.length > 0
      ? initialPersonalMessages
      : [
          {
            id: 'm1',
            sender: 'did:sonaraim:+14155550199',
            text: 'Hello from Sonaraim encrypted network!',
            timestamp: 'Just now',
          },
        ]
  );
  const [serviceCards, setServiceCards] = useState(
    initialServiceCards.length > 0
      ? initialServiceCards
      : [
          {
            id: 'c1',
            title: 'Account Verification',
            tenantDid: 'did:web:auth.sonaraim.org',
            summary: 'Your account was linked successfully.',
            actions: [
              { id: 'act-1', type: 'confirm_intent', label: 'Acknowledge' },
              { id: 'act-2', type: 'request_receipt', label: 'View Receipt' },
            ],
          },
        ]
  );

  const [recipientDid, setRecipientDid] = useState('');
  const [composerText, setComposerText] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionFeedback, setActionFeedback] = useState('');
  const [error, setError] = useState('');

  /**
   * Refreshes mailbox messages from the node relay.
   */
  async function handleRefreshMailbox() {
    setLoading(true);
    setError('');
    setActionFeedback('');
    try {
      const data = await apiClient.fetchInboxMailbox(currentUserDid);
      if (Array.isArray(data.items) && data.items.length > 0) {
        setActionFeedback(`Retrieved ${data.items.length} live item(s)`);
      } else {
        setActionFeedback('Mailbox is up to date (0 new items)');
      }
    } catch (err) {
      setError(err.message || 'Failed to refresh mailbox');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Sends an encrypted P2P message.
   */
  async function handleSendMessage() {
    if (!recipientDid.trim() || !composerText.trim()) {
      setError('Recipient DID and message text are required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await apiClient.sendP2pMessage({
        senderDid: currentUserDid,
        recipientDid: recipientDid.trim(),
        text: composerText.trim(),
      });
      const newMsg = {
        id: `m-${Date.now()}`,
        sender: currentUserDid,
        text: composerText.trim(),
        timestamp: 'Just now',
      };
      setPersonalMessages((prev) => [newMsg, ...prev]);
      setComposerText('');
      setActionFeedback(`Message dispatched to ${recipientDid.trim()}`);
    } catch (err) {
      setError(err.message || 'Failed to send message');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Triggers an action on a Zero-HTML Declarative Card.
   *
   * @param {Record<string, any>} card - Validated card envelope.
   * @param {{ id: string, type: string, label: string }} action - Action object.
   */
  function handleCardAction(card, action) {
    try {
      validateDeclarativeCard(card);
      setActionFeedback(`Action "${action.label}" (${action.type}) executed for ${card.tenantDid}`);
      setError('');
    } catch (err) {
      setError(`Card policy violation: ${err.message}`);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Dual Inbox</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={handleRefreshMailbox}>
          <Text style={styles.refreshButtonText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {/* Stream Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeStream === 'personal' && styles.tabActive]}
          onPress={() => setActiveStream('personal')}
        >
          <Text style={[styles.tabText, activeStream === 'personal' && styles.tabTextActive]}>
            Personal P2P ({personalMessages.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeStream === 'services' && styles.tabActive]}
          onPress={() => setActiveStream('services')}
        >
          <Text style={[styles.tabText, activeStream === 'services' && styles.tabTextActive]}>
            Verified Services ({serviceCards.length})
          </Text>
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
      {actionFeedback ? <Text style={styles.feedbackBanner}>{actionFeedback}</Text> : null}

      {/* Stream Content */}
      {activeStream === 'personal' ? (
        <View>
          {/* P2P Composer */}
          <View style={styles.composerCard}>
            <Text style={styles.cardHeader}>Compose Encrypted P2P</Text>
            <TextInput
              style={styles.input}
              placeholder="Recipient (e.g. did:sonaraim:+14155550199)"
              placeholderTextColor="#64748b"
              value={recipientDid}
              onChangeText={setRecipientDid}
            />
            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder="Encrypted message payload..."
              placeholderTextColor="#64748b"
              multiline
              numberOfLines={3}
              value={composerText}
              onChangeText={setComposerText}
            />
            <TouchableOpacity
              style={[styles.sendButton, loading && styles.buttonDisabled]}
              disabled={loading}
              onPress={handleSendMessage}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.sendButtonText}>Send Message</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Message List */}
          {personalMessages.map((msg) => (
            <View key={msg.id} style={styles.msgItem}>
              <View style={styles.msgHeader}>
                <Text style={styles.msgSender}>{msg.sender}</Text>
                <Text style={styles.msgTime}>{msg.timestamp}</Text>
              </View>
              <Text style={styles.msgText}>{msg.text}</Text>
            </View>
          ))}
        </View>
      ) : (
        <View>
          {serviceCards.map((card) => (
            <View key={card.id || card.title} style={styles.serviceCard}>
              <View style={styles.serviceHeader}>
                <Text style={styles.serviceTitle}>{card.title}</Text>
                <Text style={styles.verifiedBadge}>VERIFIED</Text>
              </View>
              <Text style={styles.serviceTenant}>{card.tenantDid}</Text>
              {card.summary ? <Text style={styles.serviceSummary}>{card.summary}</Text> : null}

              {/* Zero-HTML Action Buttons */}
              <View style={styles.actionRow}>
                {(card.actions || []).map((action) => (
                  <TouchableOpacity
                    key={action.id}
                    style={styles.cardActionButton}
                    onPress={() => handleCardAction(card, action)}
                  >
                    <Text style={styles.cardActionText}>{action.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090d16' },
  content: { padding: 16, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#f8fafc' },
  refreshButton: { backgroundColor: '#1e293b', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  refreshButtonText: { color: '#38bdf8', fontSize: 13, fontWeight: '600' },
  tabContainer: { flexDirection: 'row', backgroundColor: '#0f172a', borderRadius: 8, padding: 4, marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 6 },
  tabActive: { backgroundColor: '#0284c7' },
  tabText: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#ffffff' },
  composerCard: { backgroundColor: '#0f172a', borderRadius: 10, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#1e293b' },
  cardHeader: { color: '#38bdf8', fontSize: 14, fontWeight: '600', marginBottom: 10 },
  input: { backgroundColor: '#1e293b', color: '#f8fafc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, marginBottom: 8 },
  multilineInput: { minHeight: 60, textAlignVertical: 'top' },
  sendButton: { backgroundColor: '#0284c7', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  sendButtonText: { color: '#ffffff', fontWeight: '600', fontSize: 14 },
  buttonDisabled: { opacity: 0.6 },
  msgItem: { backgroundColor: '#0f172a', borderRadius: 8, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#1e293b' },
  msgHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  msgSender: { color: '#38bdf8', fontSize: 12, fontWeight: '600' },
  msgTime: { color: '#64748b', fontSize: 11 },
  msgText: { color: '#f8fafc', fontSize: 14 },
  serviceCard: { backgroundColor: '#0f172a', borderRadius: 10, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#334155' },
  serviceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  serviceTitle: { color: '#f8fafc', fontSize: 16, fontWeight: '700' },
  verifiedBadge: { backgroundColor: '#065f46', color: '#34d399', fontSize: 10, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  serviceTenant: { color: '#94a3b8', fontSize: 12, marginVertical: 4 },
  serviceSummary: { color: '#cbd5e1', fontSize: 14, marginBottom: 12 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cardActionButton: { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#38bdf8', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 },
  cardActionText: { color: '#38bdf8', fontSize: 13, fontWeight: '600' },
  errorBanner: { backgroundColor: '#7f1d1d', color: '#fecaca', padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13 },
  feedbackBanner: { backgroundColor: '#064e3b', color: '#a7f3d0', padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13 },
});

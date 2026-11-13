/**
 * @fileoverview Dual Inbox Screen for Sonaraim Mobile.
 * Integrates Personal P2P and Verified Services streams, Declarative Cards,
 * E2EE Media Composer, Quote Replies, Emoji Reactions, and Read Receipts.
 */

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { apiClient } from '../apiClient.js';
import { validateDeclarativeCard } from '../cardValidator.js';
import { MediaComposer } from '../components/MediaComposer.js';
import { PersonalMessageItem } from '../components/PersonalMessageItem.js';
import { toggleReaction, buildQuoteReply, sendRelaySignal } from '../chatFeatures.js';
import { inboxStyles as styles } from '../styles/inboxStyles.js';

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
            receiptStatus: 'read',
            reactions: { '👍': ['did:sonaraim:+14155550199'] },
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
  const [quotingMessage, setQuotingMessage] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
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
      const count = Array.isArray(data.items) ? data.items.length : 0;
      setActionFeedback(count > 0 ? `Retrieved ${count} live item(s)` : 'Mailbox is up to date (0 new items)');
    } catch (err) {
      setError(err.message || 'Failed to refresh mailbox');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Handles dispatching a message payload from the MediaComposer.
   *
   * @param {{ text: string, mediaPointer?: any }} payload
   */
  async function handleSendMessage({ text, mediaPointer }) {
    if (!recipientDid.trim()) {
      setError('Recipient DID is required before sending');
      return;
    }
    setError('');
    try {
      let newMsg;
      if (quotingMessage) {
        newMsg = buildQuoteReply({
          targetMessage: quotingMessage,
          senderDid: currentUserDid,
          replyText: text,
          mediaPointer,
        });
        setQuotingMessage(null);
      } else {
        newMsg = {
          id: `m-${Date.now()}`,
          sender: currentUserDid,
          text,
          mediaPointer,
          timestamp: 'Just now',
          receiptStatus: 'sent',
          reactions: {},
        };
      }

      await apiClient.sendP2pMessage({
        senderDid: currentUserDid,
        recipientDid: recipientDid.trim(),
        text,
      });

      setPersonalMessages((prev) => [newMsg, ...prev]);
      setActionFeedback(`Message dispatched to ${recipientDid.trim()}`);
    } catch (err) {
      setError(err.message || 'Failed to send message');
    }
  }

  /**
   * Toggles an emoji reaction on a message.
   *
   * @param {string} messageId - ID of target message.
   * @param {string} emoji - Selected emoji.
   */
  function handleToggleReaction(messageId, emoji) {
    setPersonalMessages((prev) =>
      prev.map((msg) => (msg.id === messageId ? toggleReaction(msg, currentUserDid, emoji) : msg))
    );
  }

  /**
   * Triggers typing notification signal.
   *
   * @param {boolean} typingState - Whether the user is currently typing.
   */
  async function handleTypingSignal(typingState) {
    setIsTyping(typingState);
    if (!recipientDid.trim()) return;
    try {
      await sendRelaySignal({
        nodeApiUrl: apiClient.config.nodeApiUrl,
        senderDid: currentUserDid,
        recipientDid: recipientDid.trim(),
        signalType: 'typing',
        payload: { is_typing: typingState },
      });
    } catch {
      // Ephemeral typing signals fail silently
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
            Services ({serviceCards.length})
          </Text>
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
      {actionFeedback ? <Text style={styles.feedbackBanner}>{actionFeedback}</Text> : null}

      {activeStream === 'personal' ? (
        <View>
          <View style={styles.composerCard}>
            <Text style={styles.cardHeader}>E2EE Message Composer</Text>
            <TextInput
              style={styles.input}
              placeholder="Recipient (e.g. did:sonaraim:+14155550199)"
              placeholderTextColor="#64748b"
              value={recipientDid}
              onChangeText={setRecipientDid}
            />

            {quotingMessage ? (
              <View style={styles.quoteBanner}>
                <View>
                  <Text style={styles.quoteSender}>Replying to {quotingMessage.sender || quotingMessage.senderDid}</Text>
                  <Text style={styles.quoteText} numberOfLines={1}>{quotingMessage.text}</Text>
                </View>
                <TouchableOpacity onPress={() => setQuotingMessage(null)}>
                  <Text style={styles.quoteCancel}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <MediaComposer
              onSend={handleSendMessage}
              onTyping={handleTypingSignal}
              disabled={loading}
            />
          </View>

          {isTyping && recipientDid ? (
            <View style={styles.typingBanner}>
              <Text style={styles.typingText}>Typing to {recipientDid}...</Text>
            </View>
          ) : null}

          {personalMessages.map((msg) => (
            <PersonalMessageItem
              key={msg.id}
              msg={msg}
              onToggleReaction={handleToggleReaction}
              onQuoteReply={setQuotingMessage}
            />
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

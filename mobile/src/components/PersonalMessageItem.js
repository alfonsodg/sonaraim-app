/**
 * @fileoverview Single Personal P2P Message Item component with reactions,
 * quote preview, multimedia pointer badge, and receipt checkmarks.
 */

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { inboxStyles as styles } from '../styles/inboxStyles.js';

/**
 * Renders an encrypted personal P2P message item with reactions and quote replies.
 *
 * @param {{
 *   msg: Record<string, any>,
 *   onToggleReaction: (msgId: string, emoji: string) => void,
 *   onQuoteReply: (msg: Record<string, any>) => void
 * }} props
 * @returns {React.ReactElement}
 */
export function PersonalMessageItem({ msg, onToggleReaction, onQuoteReply }) {
  return (
    <View style={styles.msgItem}>
      {msg.quote ? (
        <View style={styles.quotedMsgBox}>
          <Text style={styles.quotedMsgSender}>↩ Replying to {msg.quote.senderDid}</Text>
          <Text style={styles.quotedMsgText} numberOfLines={1}>
            {msg.quote.previewText}
          </Text>
        </View>
      ) : null}

      <View style={styles.msgHeader}>
        <Text style={styles.msgSender}>{msg.sender || msg.senderDid}</Text>
        <View style={styles.msgMeta}>
          <Text style={styles.msgTime}>{msg.timestamp || 'Just now'}</Text>
          {msg.receiptStatus ? (
            <Text
              style={[
                styles.receiptIcon,
                msg.receiptStatus === 'read'
                  ? styles.receiptRead
                  : msg.receiptStatus === 'delivered'
                  ? styles.receiptDelivered
                  : styles.receiptSent,
              ]}
            >
              {msg.receiptStatus === 'sent' ? '✓' : '✓✓'}
            </Text>
          ) : null}
        </View>
      </View>

      {msg.mediaPointer ? (
        <View style={styles.mediaBadge}>
          <Text style={styles.mediaBadgeText}>
            📎 {msg.mediaPointer.type || 'attachment'}:{' '}
            {msg.mediaPointer.fileName || msg.mediaPointer.name || 'encrypted'}
          </Text>
        </View>
      ) : null}

      <Text style={styles.msgText}>{msg.text}</Text>

      {msg.reactions && Object.keys(msg.reactions).length > 0 ? (
        <View style={styles.reactionsRow}>
          {Object.entries(msg.reactions).map(([emoji, users]) => (
            <TouchableOpacity
              key={emoji}
              style={styles.reactionChip}
              onPress={() => onToggleReaction(msg.id, emoji)}
            >
              <Text>{emoji}</Text>
              <Text style={styles.reactionCount}>{users.length}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <View style={styles.msgActionRow}>
        <TouchableOpacity onPress={() => onToggleReaction(msg.id, '👍')}>
          <Text style={styles.actionText}>👍</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onToggleReaction(msg.id, '❤️')}>
          <Text style={styles.actionText}>❤️</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onToggleReaction(msg.id, '😂')}>
          <Text style={styles.actionText}>😂</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onQuoteReply(msg)}>
          <Text style={styles.actionText}>↩ Reply</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

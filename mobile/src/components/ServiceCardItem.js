/**
 * @fileoverview Verified Services-tab card item for Sonaraim Mobile Dual Inbox.
 * Extracted from `InboxScreen.js` to keep the screen under the 300-line
 * modularity boundary (issue #12 acceptance).
 */

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { inboxStyles as styles } from '../styles/inboxStyles.js';

/**
 * Renders a single verified `did:web:` service card with action buttons.
 *
 * @param {{
 *   card: { id?: string, title?: string, tenantDid?: string, summary?: string, actions?: Array<{ id: string, label: string }> },
 *   onCardAction?: (card: any, action: any) => void
 * }} props
 * @returns {React.ReactElement} Rendered service card.
 */
export function ServiceCardItem({ card, onCardAction = () => {} }) {
  return (
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
            onPress={() => onCardAction(card, action)}
          >
            <Text style={styles.cardActionText}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

/**
 * @fileoverview E2EE Group Chats Screen for Sonaraim Mobile.
 * Manages MLS-ratcheted group creation, member additions/removals, and encrypted group threads.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import {
  createGroup,
  addGroupMember,
  removeGroupMember,
  appendGroupMessage,
} from '../groupManager.js';
import { groupsStyles as styles } from '../styles/groupsStyles.js';

/**
 * Screen component for creating, managing, and chatting in E2EE MLS groups.
 *
 * @param {{
 *   currentUserDid?: string,
 *   initialGroups?: Array<Record<string, any>>
 * }} [props]
 * @returns {React.ReactElement}
 */
export function GroupsScreen({
  currentUserDid = 'did:sonaraim:mobile-user',
  initialGroups = [],
} = {}) {
  const [groups, setGroups] = useState(() => initialGroups);
  const [activeGroupId, setActiveGroupId] = useState(initialGroups[0]?.groupId || '');

  useEffect(() => {
    if (initialGroups.length > 0) return;
    let cancelled = false;
    (async () => {
      const defaultGroup = await createGroup({
        groupId: 'grp-core-community',
        creatorDid: currentUserDid,
        title: 'Sonaraim Core Community',
        initialMembers: ['did:sonaraim:+14155550199'],
      });
      await appendGroupMessage(defaultGroup, {
        senderDid: currentUserDid,
        text: 'Welcome to the zero-knowledge E2EE group thread!',
      });
      if (!cancelled) {
        setGroups([defaultGroup]);
        setActiveGroupId(defaultGroup.groupId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUserDid, initialGroups.length]);
  const [newGroupTitle, setNewGroupTitle] = useState('');
  const [newGroupMember, setNewGroupMember] = useState('');
  const [addMemberInput, setAddMemberInput] = useState('');
  const [groupMsgText, setGroupMsgText] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const activeGroup = groups.find((g) => g.groupId === activeGroupId) || null;

  /**
   * Handles creating a new E2EE group.
   */
  async function handleCreateGroup() {
    if (!newGroupTitle.trim()) {
      setError('Group title is required');
      return;
    }
    setError('');
    const id = `grp-${Date.now()}`;
    const members = newGroupMember.trim() ? [newGroupMember.trim()] : [];
    try {
      const created = await createGroup({
        groupId: id,
        creatorDid: currentUserDid,
        title: newGroupTitle.trim(),
        initialMembers: members,
      });
      setGroups((prev) => [created, ...prev]);
      setActiveGroupId(created.groupId);
      setNewGroupTitle('');
      setNewGroupMember('');
      setFeedback(`Group "${created.title}" created at epoch 0`);
    } catch (err) {
      setError(err.message);
    }
  }

  /**
   * Adds a new member to the active group and ratchets key.
   */
  async function handleAddMember() {
    if (!activeGroup || !addMemberInput.trim()) return;
    setError('');
    try {
      const updated = await addGroupMember(activeGroup, addMemberInput.trim());
      setGroups((prev) => prev.map((g) => (g.groupId === updated.groupId ? updated : g)));
      setAddMemberInput('');
      setFeedback(`Added member. Ratcheted to epoch ${updated.epoch}`);
    } catch (err) {
      setError(err.message);
    }
  }

  /**
   * Removes a member from the active group and ratchets key.
   * @param {string} memberDid
   */
  async function handleRemoveMember(memberDid) {
    if (!activeGroup) return;
    setError('');
    try {
      const updated = await removeGroupMember(activeGroup, memberDid);
      setGroups((prev) => prev.map((g) => (g.groupId === updated.groupId ? updated : g)));
      setFeedback(`Removed ${memberDid}. Ratcheted to epoch ${updated.epoch}`);
    } catch (err) {
      setError(err.message);
    }
  }

  /**
   * Sends an encrypted application message to the active group.
   */
  async function handleSendGroupMessage() {
    if (!activeGroup || !groupMsgText.trim()) return;
    setError('');
    try {
      await appendGroupMessage(activeGroup, {
        senderDid: currentUserDid,
        text: groupMsgText.trim(),
      });
      setGroups([...groups]);
      setGroupMsgText('');
      setFeedback('Message encrypted & appended to epoch ' + activeGroup.epoch);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>E2EE Groups</Text>
      </View>
      <Text style={styles.headerSubtitle}>
        MLS-ratcheted group chats with forward secrecy and post-compromise security.
      </Text>

      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
      {feedback ? <Text style={styles.feedbackBanner}>{feedback}</Text> : null}

      {/* Create Group Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Create New E2EE Group</Text>
        <TextInput
          style={styles.input}
          placeholder="Group Title (e.g. Privacy Advocates)"
          placeholderTextColor="#64748b"
          value={newGroupTitle}
          onChangeText={setNewGroupTitle}
        />
        <TextInput
          style={styles.input}
          placeholder="Initial Member DID (optional)"
          placeholderTextColor="#64748b"
          value={newGroupMember}
          onChangeText={setNewGroupMember}
        />
        <TouchableOpacity style={styles.primaryBtn} onPress={handleCreateGroup}>
          <Text style={styles.primaryBtnText}>Create Group</Text>
        </TouchableOpacity>
      </View>

      {/* Groups List */}
      <Text style={[styles.cardTitle, { marginBottom: 8 }]}>Your Encrypted Groups ({groups.length})</Text>
      {groups.map((grp) => {
        const isSelected = grp.groupId === activeGroupId;
        return (
          <TouchableOpacity
            key={grp.groupId}
            style={[styles.groupItem, isSelected && styles.groupItemActive]}
            onPress={() => setActiveGroupId(grp.groupId)}
          >
            <View style={styles.groupHeader}>
              <Text style={styles.groupTitle}>{grp.title}</Text>
              <View style={styles.epochBadge}>
                <Text style={styles.epochText}>Epoch {grp.epoch}</Text>
              </View>
            </View>
            <Text style={styles.groupMeta}>{grp.members.length} members • {grp.messages.length} messages</Text>
            <Text style={styles.transcriptHash} numberOfLines={1}>
              Digest: {grp.transcriptDigestHex ? grp.transcriptDigestHex.slice(0, 24) : 'N/A'}...
            </Text>
          </TouchableOpacity>
        );
      })}

      {/* Active Group Chat & Members View */}
      {activeGroup ? (
        <View style={styles.chatBox}>
          <Text style={styles.chatTitle}>{activeGroup.title} — Active Thread</Text>

          {/* Members */}
          <Text style={[styles.groupMeta, { marginBottom: 6, fontWeight: '700' }]}>Members ({activeGroup.members.length}):</Text>
          {activeGroup.members.map((member) => (
            <View key={member} style={styles.memberRow}>
              <Text style={styles.memberName}>{member}</Text>
              {member !== currentUserDid ? (
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => handleRemoveMember(member)}
                >
                  <Text style={styles.removeBtnText}>Remove</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}

          {/* Add Member input */}
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, marginBottom: 12 }}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              placeholder="Add member DID..."
              placeholderTextColor="#64748b"
              value={addMemberInput}
              onChangeText={setAddMemberInput}
            />
            <TouchableOpacity style={[styles.primaryBtn, { paddingHorizontal: 12, marginTop: 0 }]} onPress={handleAddMember}>
              <Text style={styles.primaryBtnText}>Add</Text>
            </TouchableOpacity>
          </View>

          {/* Messages */}
          <Text style={[styles.groupMeta, { marginBottom: 6, fontWeight: '700' }]}>Messages ({activeGroup.messages.length}):</Text>
          <ScrollView style={styles.chatMsgList} nestedScrollEnabled>
            {activeGroup.messages.map((m) => (
              <View key={m.id} style={styles.chatMsgItem}>
                <Text style={styles.chatMsgSender}>{m.senderDid} (Epoch {m.epoch})</Text>
                <Text style={styles.chatMsgText}>{m.text}</Text>
              </View>
            ))}
          </ScrollView>

          {/* Send Group Message */}
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              placeholder="Encrypted group message..."
              placeholderTextColor="#64748b"
              value={groupMsgText}
              onChangeText={setGroupMsgText}
            />
            <TouchableOpacity style={[styles.primaryBtn, { paddingHorizontal: 14, marginTop: 0 }]} onPress={handleSendGroupMessage}>
              <Text style={styles.primaryBtnText}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

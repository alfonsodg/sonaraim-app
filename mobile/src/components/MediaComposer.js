/**
 * @fileoverview E2EE Multimedia Composer component for React Native.
 * Allows attaching encrypted images, videos, voice notes, stickers, and emojis.
 */

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import {
  getEmojiCatalog,
  getStickerCatalog,
  searchGifs,
} from '../mediaCrypto.js';
import { apiClient } from '../apiClient.js';
import { processMediaAttachment } from '../mediaComposerLogic.js';
import { mediaComposerStyles as styles } from '../styles/mediaComposerStyles.js';

/**
 * Multimedia composer toolbar for sending text, attachments, emojis, stickers, and GIFs.
 *
 * @param {{
 *   onSend: (messagePayload: { text: string, mediaPointer?: any }) => void,
 *   onTyping?: (isTyping: boolean) => void,
 *   placeholder?: string,
 *   disabled?: boolean
 * }} props
 * @returns {React.ReactElement}
 */
export function MediaComposer({
  onSend,
  onTyping,
  placeholder = 'Type an encrypted message...',
  disabled = false,
}) {
  const [text, setText] = useState('');
  const [activeTray, setActiveTray] = useState(null); // 'emoji' | 'sticker' | 'gif' | null
  const [gifQuery, setGifQuery] = useState('');
  const [attachError, setAttachError] = useState('');

  const emojis = getEmojiCatalog();
  const stickers = getStickerCatalog();
  const gifs = searchGifs(gifQuery);

  /**
   * Handles text input changes and triggers optional typing indicator.
   * @param {string} val
   */
  function handleTextChange(val) {
    setText(val);
    if (onTyping) {
      onTyping(val.length > 0);
    }
  }

  /**
   * Dispatches text and resets composer state.
   */
  function handleSend() {
    if (!text.trim() || disabled) return;
    onSend({ text: text.trim() });
    setText('');
    setActiveTray(null);
    if (onTyping) onTyping(false);
  }

  /**
   * Captures/picks native media, encrypts it with AES-256-GCM, uploads via presigned URL,
   * and dispatches the resulting encrypted media pointer.
   *
   * @param {'image' | 'video' | 'audio'} kind - Attachment type.
   */
  async function handleAttachMedia(kind) {
    if (disabled) return;
    setAttachError('');
    try {
      const result = await processMediaAttachment({
        kind,
        nodeApiUrl: apiClient.config.nodeApiUrl,
      });
      if (result.cancelled || !result.mediaPointer) {
        return;
      }

      onSend({
        text: text.trim() || `[Encrypted ${kind.toUpperCase()}]`,
        mediaPointer: result.mediaPointer,
      });
      setText('');
      setActiveTray(null);
    } catch (err) {
      setAttachError(err?.message || `Failed to attach ${kind}`);
    }
  }

  return (
    <View style={styles.container}>
      {attachError ? (
        <Text style={{ color: '#ef4444', fontSize: 12, marginBottom: 4 }}>{attachError}</Text>
      ) : null}
      {activeTray ? (
        <View style={styles.pickerTray}>
          <View style={styles.trayHeader}>
            <Text style={styles.trayTitle}>
              {activeTray === 'emoji' ? 'Select Emoji' : activeTray === 'sticker' ? 'Select Sticker' : 'Select GIF'}
            </Text>
            <TouchableOpacity onPress={() => setActiveTray(null)}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {activeTray === 'emoji' ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.emojiRow}>
                {emojis.map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={styles.emojiButton}
                    onPress={() => setText((prev) => `${prev}${emoji}`)}
                  >
                    <Text style={styles.emojiChar}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          ) : activeTray === 'sticker' ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.assetRow}>
                {stickers.map((stk) => (
                  <TouchableOpacity
                    key={stk.id}
                    style={styles.assetItem}
                    onPress={() => {
                      onSend({
                        text: `[Sticker: ${stk.name}]`,
                        mediaPointer: { type: 'sticker', ...stk },
                      });
                      setActiveTray(null);
                    }}
                  >
                    <Text style={styles.assetText}>🏷️ {stk.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.assetRow}>
                {gifs.map((g) => (
                  <TouchableOpacity
                    key={g.id}
                    style={styles.assetItem}
                    onPress={() => {
                      onSend({
                        text: `[GIF: ${g.title}]`,
                        mediaPointer: { type: 'gif', ...g },
                      });
                      setActiveTray(null);
                    }}
                  >
                    <Text style={styles.assetText}>🎬 {g.title}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          )}
        </View>
      ) : null}

      <View style={styles.toolbarRow}>
        <TouchableOpacity
          style={[styles.toolButton, activeTray === 'emoji' && styles.toolButtonActive]}
          onPress={() => setActiveTray(activeTray === 'emoji' ? null : 'emoji')}
        >
          <Text style={styles.toolIcon}>😀</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toolButton, activeTray === 'sticker' && styles.toolButtonActive]}
          onPress={() => setActiveTray(activeTray === 'sticker' ? null : 'sticker')}
        >
          <Text style={styles.toolIcon}>🏷️</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toolButton, activeTray === 'gif' && styles.toolButtonActive]}
          onPress={() => setActiveTray(activeTray === 'gif' ? null : 'gif')}
        >
          <Text style={styles.toolIcon}>🎬</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolButton} onPress={() => handleAttachMedia('image')}>
          <Text style={styles.toolIcon}>📷</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolButton} onPress={() => handleAttachMedia('audio')}>
          <Text style={styles.toolIcon}>🎙️</Text>
        </TouchableOpacity>

        <TextInput
          style={styles.textInput}
          placeholder={placeholder}
          placeholderTextColor="#64748b"
          value={text}
          onChangeText={handleTextChange}
          editable={!disabled}
        />

        <TouchableOpacity
          style={[styles.sendButton, (!text.trim() || disabled) && styles.sendButtonDisabled]}
          disabled={!text.trim() || disabled}
          onPress={handleSend}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

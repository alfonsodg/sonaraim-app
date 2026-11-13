/**
 * @fileoverview Styles for the E2EE MediaComposer component.
 */

import { StyleSheet } from 'react-native';

/**
 * E2EE Media Composer styles.
 */
export const mediaComposerStyles = StyleSheet.create({
  container: {
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    padding: 8,
  },
  pickerTray: {
    backgroundColor: '#1e293b',
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  trayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  trayTitle: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
  },
  closeText: {
    color: '#94a3b8',
    fontSize: 12,
  },
  emojiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  emojiButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#0f172a',
  },
  emojiChar: {
    fontSize: 18,
  },
  assetRow: {
    flexDirection: 'row',
    gap: 8,
  },
  assetItem: {
    backgroundColor: '#0f172a',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  assetText: {
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '600',
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toolButton: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
  },
  toolButtonActive: {
    backgroundColor: '#0284c7',
  },
  toolIcon: {
    fontSize: 14,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#1e293b',
    color: '#f8fafc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  sendButton: {
    backgroundColor: '#059669',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});

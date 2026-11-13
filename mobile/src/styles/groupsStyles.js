/**
 * @fileoverview Styles for the E2EE Groups screen and group chat threads.
 */

import { StyleSheet } from 'react-native';

/**
 * E2EE Groups screen styles.
 */
export const groupsStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090d16' },
  content: { padding: 16, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#f8fafc' },
  headerSubtitle: { fontSize: 13, color: '#94a3b8', marginBottom: 14 },
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#38bdf8', marginBottom: 10 },
  input: {
    backgroundColor: '#1e293b',
    color: '#f8fafc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  primaryBtn: {
    backgroundColor: '#0284c7',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  groupItem: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  groupItemActive: {
    borderColor: '#0284c7',
  },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  groupTitle: { fontSize: 16, fontWeight: '700', color: '#f8fafc' },
  epochBadge: {
    backgroundColor: '#0369a1',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  epochText: { color: '#e0f2fe', fontSize: 11, fontWeight: '700' },
  groupMeta: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  transcriptHash: { fontSize: 10, color: '#64748b', fontFamily: 'monospace', marginTop: 2 },
  chatBox: {
    backgroundColor: '#0b1120',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  chatTitle: { fontSize: 14, fontWeight: '700', color: '#38bdf8', marginBottom: 8 },
  chatMsgList: { maxHeight: 200, marginBottom: 8 },
  chatMsgItem: {
    backgroundColor: '#1e293b',
    padding: 8,
    borderRadius: 6,
    marginBottom: 6,
  },
  chatMsgSender: { fontSize: 10, color: '#38bdf8', fontWeight: '700' },
  chatMsgText: { fontSize: 13, color: '#f8fafc', marginTop: 2 },
  memberRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 3 },
  memberName: { fontSize: 12, color: '#cbd5e1' },
  removeBtn: { paddingHorizontal: 6, paddingVertical: 2, backgroundColor: '#7f1d1d', borderRadius: 4 },
  removeBtnText: { color: '#fecaca', fontSize: 10, fontWeight: '700' },
  feedbackBanner: { backgroundColor: '#064e3b', color: '#a7f3d0', padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13 },
  errorBanner: { backgroundColor: '#7f1d1d', color: '#fecaca', padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13 },
});

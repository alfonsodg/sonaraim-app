/**
 * @fileoverview Styles for the 24h Ephemeral Status/Stories screen.
 */

import { StyleSheet } from 'react-native';

/**
 * 24h Ephemeral Status/Stories screen styles.
 */
export const statusStyles = StyleSheet.create({
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
  statusItem: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#10b981',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  statusHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  statusAuthor: { color: '#38bdf8', fontSize: 13, fontWeight: '700' },
  statusExpires: { color: '#10b981', fontSize: 11, fontWeight: '600' },
  statusText: { color: '#f8fafc', fontSize: 14, marginTop: 4 },
  mediaBadge: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  mediaBadgeText: { color: '#38bdf8', fontSize: 11, fontWeight: '600' },
  pushCard: {
    backgroundColor: '#0b1120',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  pushStatusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  pushDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10b981', marginRight: 6 },
  pushStatusText: { color: '#cbd5e1', fontSize: 12, fontWeight: '600' },
  feedbackBanner: { backgroundColor: '#064e3b', color: '#a7f3d0', padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13 },
  errorBanner: { backgroundColor: '#7f1d1d', color: '#fecaca', padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13 },
});

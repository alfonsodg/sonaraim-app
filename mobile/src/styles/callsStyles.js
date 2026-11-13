/**
 * @fileoverview Styles for the LiveKit Calls Screen.
 */

import { StyleSheet } from 'react-native';

/**
 * LiveKit Calls screen styles.
 */
export const callsStyles = StyleSheet.create({
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
    fontSize: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  primaryButton: {
    backgroundColor: '#059669',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 6,
  },
  buttonText: { color: '#ffffff', fontWeight: '600', fontSize: 14 },
  buttonDisabled: { opacity: 0.6 },
  activeCallCard: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#059669',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10b981',
    marginRight: 8,
  },
  statusText: { color: '#10b981', fontWeight: '700', fontSize: 13, letterSpacing: 1 },
  sessionDetails: { marginBottom: 12 },
  detailLabel: { color: '#94a3b8', fontSize: 12, marginTop: 4 },
  detailValue: { color: '#f8fafc', fontSize: 13, fontWeight: '600' },
  tokenBox: {
    color: '#38bdf8',
    backgroundColor: '#1e293b',
    padding: 6,
    borderRadius: 6,
    fontSize: 11,
    fontFamily: 'monospace',
    marginTop: 3,
  },
  endedBox: {
    padding: 12,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    alignItems: 'center',
  },
  endedText: { color: '#94a3b8', fontSize: 13 },
  errorBanner: {
    backgroundColor: '#7f1d1d',
    color: '#fecaca',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    fontSize: 13,
  },
});

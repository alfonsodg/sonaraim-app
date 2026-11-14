/**
 * @fileoverview Unit tests for LiveKit external Meet/WebRTC join URL construction.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildLiveKitJoinUrl } from '../src/apiClient.js';

describe('LiveKit External Call Launcher', () => {
  it('builds a valid LiveKit Meet join URL from wss:// serverUrl and JWT token', () => {
    const url = buildLiveKitJoinUrl({
      serverUrl: 'wss://livekit.example.com',
      token: 'eyJhbGciOiJIUzI1NiJ9.payload.sig',
      roomName: 'sonaraim-secure-room',
      meetBaseUrl: 'https://meet.livekit.io/custom',
    });

    assert.equal(
      url,
      'https://meet.livekit.io/custom?liveKitUrl=wss%3A%2F%2Flivekit.example.com&token=eyJhbGciOiJIUzI1NiJ9.payload.sig'
    );
  });

  it('uses EXPO_PUBLIC_LIVEKIT_MEET_URL when meetBaseUrl is omitted and fails when unconfigured', () => {
    const prev = process.env.EXPO_PUBLIC_LIVEKIT_MEET_URL;
    process.env.EXPO_PUBLIC_LIVEKIT_MEET_URL = 'https://meet.custom.example.com/room/';
    try {
      const url = buildLiveKitJoinUrl({
        serverUrl: 'wss://livekit.example.com',
        token: 'jwt.tok.sig',
      });
      assert.equal(
        url,
        'https://meet.custom.example.com/room?liveKitUrl=wss%3A%2F%2Flivekit.example.com&token=jwt.tok.sig'
      );
    } finally {
      if (prev === undefined) delete process.env.EXPO_PUBLIC_LIVEKIT_MEET_URL;
      else process.env.EXPO_PUBLIC_LIVEKIT_MEET_URL = prev;
    }

    delete process.env.EXPO_PUBLIC_LIVEKIT_MEET_URL;
    assert.throws(
      () => buildLiveKitJoinUrl({ serverUrl: 'wss://lk.example.com', token: 'abc' }),
      /Missing required mobile configuration: livekitMeetUrl/
    );
  });

  it('rejects empty serverUrl or token', () => {
    assert.throws(
      () => buildLiveKitJoinUrl({ serverUrl: '', token: 'abc' }),
      /serverUrl and token are required/
    );
    assert.throws(
      () => buildLiveKitJoinUrl({ serverUrl: 'wss://lk.example.com', token: '' }),
      /serverUrl and token are required/
    );
  });
});

/**
 * @fileoverview Pure reducer and state model for WebRTC in-app call controls.
 * Separated from React Native UI layer to allow native node:test execution.
 */

/**
 * Returns default initial call control state.
 *
 * @returns {{
 *   isMuted: boolean,
 *   isCameraOn: boolean,
 *   cameraFacing: 'front' | 'back',
 *   isSpeakerOn: boolean
 * }}
 */
export function initialCallControlsState() {
  return {
    isMuted: false,
    isCameraOn: true,
    cameraFacing: 'front',
    isSpeakerOn: false,
  };
}

/**
 * Pure reducer function resolving next call control state given an action type.
 *
 * @param {{
 *   isMuted: boolean,
 *   isCameraOn: boolean,
 *   cameraFacing: 'front' | 'back',
 *   isSpeakerOn: boolean
 * }} state - Current state.
 * @param {'toggle_mute' | 'toggle_camera' | 'switch_camera' | 'toggle_speaker'} action - Action string.
 * @returns {{
 *   isMuted: boolean,
 *   isCameraOn: boolean,
 *   cameraFacing: 'front' | 'back',
 *   isSpeakerOn: boolean
 * }}
 */
export function resolveCallControlAction(state, action) {
  switch (action) {
    case 'toggle_mute':
      return { ...state, isMuted: !state.isMuted };
    case 'toggle_camera':
      return { ...state, isCameraOn: !state.isCameraOn };
    case 'switch_camera':
      return {
        ...state,
        cameraFacing: state.cameraFacing === 'front' ? 'back' : 'front',
      };
    case 'toggle_speaker':
      return { ...state, isSpeakerOn: !state.isSpeakerOn };
    default:
      return state;
  }
}

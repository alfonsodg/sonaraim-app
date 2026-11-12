/**
 * @fileoverview Zero-HTML Native Declarative Card Renderer and Action Signer for SonarAIM.
 * Verifies merchant Ed25519 signatures over canonical card envelopes, strictly rejects HTML,
 * script, or unsafe component types, and produces native view descriptors plus signed user actions.
 */

import crypto from 'node:crypto';

/** Allowed declarative native component types in SonarAIM Zero-HTML cards. */
const ALLOWED_COMPONENT_TYPES = Object.freeze(new Set([
  'header',
  'text',
  'key_value',
  'media_image',
  'divider',
  'badge',
  'action_group'
]));

/** Allowed interactive action primitives in SonarAIM Zero-HTML cards. */
const ALLOWED_ACTION_TYPES = Object.freeze(new Set([
  'confirm_intent',
  'select_option',
  'open_deep_link',
  'request_receipt'
]));

/** Regex pattern detecting embedded HTML tags or script/event injection vectors. */
const HTML_INJECTION_PATTERN = /<\s*\/?\s*[a-zA-Z!][^>]*>|javascript:|data:text\/html|on[a-z]+\s*=/i;

/**
 * Resolves card validation limits from environment variables with safe defaults.
 * @param {Record<string, string | undefined>} [env] - Environment variable dictionary.
 * @returns {{ maxComponents: number, maxActions: number, signatureAlgorithm: string }}
 */
export function resolveCardConfig(env = process.env) {
  return {
    maxComponents: Number.parseInt(env.SONARAIM_CARD_MAX_COMPONENTS || '24', 10),
    maxActions: Number.parseInt(env.SONARAIM_CARD_MAX_ACTIONS || '6', 10),
    signatureAlgorithm: env.SONARAIM_CARD_SIGNATURE_ALGORITHM || 'Ed25519'
  };
}

/**
 * Deterministically serializes a JSON value with lexicographically sorted object keys
 * so cryptographic signatures are reproducible across platforms.
 * @param {unknown} value - Value to canonicalize.
 * @returns {string} Canonical JSON string.
 */
export function canonicalizeJson(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeJson(item)).join(',')}]`;
  }
  const entries = Object.keys(value)
    .sort()
    .filter((key) => value[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalizeJson(value[key])}`);
  return `{${entries.join(',')}}`;
}

/**
 * Recursively inspects string values inside a component to guarantee Zero-HTML compliance.
 * @param {unknown} node - Arbitrary property value inside a declarative component.
 * @param {string} path - Property path for diagnostic error reporting.
 */
function assertZeroHtmlStrings(node, path) {
  if (typeof node === 'string') {
    if (HTML_INJECTION_PATTERN.test(node)) {
      throw new Error(`Zero-HTML policy violation at ${path}: markup or script URI detected`);
    }
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item, idx) => assertZeroHtmlStrings(item, `${path}[${idx}]`));
    return;
  }
  if (node && typeof node === 'object') {
    for (const [key, val] of Object.entries(node)) {
      assertZeroHtmlStrings(val, `${path}.${key}`);
    }
  }
}

/**
 * Verifies an Ed25519 signature over the canonical representation of a payload.
 * @param {object} payload - Unsigned card body or action payload.
 * @param {string} signatureBase64 - Base64-encoded Ed25519 signature.
 * @param {string | crypto.KeyObject} publicKeyPemOrObject - Merchant Ed25519 public key.
 * @returns {boolean} True if signature is cryptographically valid.
 */
export function verifyCardSignature(payload, signatureBase64, publicKeyPemOrObject) {
  if (!payload || typeof signatureBase64 !== 'string' || !signatureBase64) {
    return false;
  }
  try {
    const keyObject = typeof publicKeyPemOrObject === 'string'
      ? crypto.createPublicKey(publicKeyPemOrObject)
      : publicKeyPemOrObject;
    const canonicalBytes = Buffer.from(canonicalizeJson(payload), 'utf8');
    const signatureBytes = Buffer.from(signatureBase64, 'base64');
    return crypto.verify(null, canonicalBytes, keyObject, signatureBytes);
  } catch {
    return false;
  }
}

/**
 * Parses, cryptographically verifies, and transforms a signed declarative card envelope
 * into a native platform-agnostic view descriptor tree (SwiftUI / Jetpack Compose / DOM).
 * @param {{
 *   card: {
 *     cardId: string,
 *     merchantDid: string,
 *     schemaVersion: string,
 *     issuedAt: number,
 *     components: Array<{ id: string, type: string, props?: Record<string, unknown>, actions?: Array<{ actionId: string, type: string, label: string, payload?: Record<string, unknown> }> }>
 *   },
 *   signature: string
 * }} envelope - Signed card envelope received over an MLS SERVICES stream.
 * @param {string | crypto.KeyObject} merchantPublicKey - Verified Ed25519 public key from merchant `did:web` document.
 * @param {Partial<ReturnType<typeof resolveCardConfig>>} [options] - Optional validation limits.
 * @returns {{
 *   viewType: 'SONARAIM_NATIVE_CARD',
 *   cardId: string,
 *   merchantDid: string,
 *   verifiedSignature: true,
 *   nodes: Array<{ nodeId: string, widget: string, props: Record<string, unknown>, actions: Array<{ actionId: string, type: string, label: string, payload: Record<string, unknown> }> }>
 * }}
 */
export function renderDeclarativeCard(envelope, merchantPublicKey, options = {}) {
  const config = { ...resolveCardConfig(), ...options };
  if (!envelope || typeof envelope !== 'object' || !envelope.card) {
    throw new Error('Invalid card envelope: missing card body');
  }

  const { card, signature } = envelope;
  if (!verifyCardSignature(card, signature, merchantPublicKey)) {
    throw new Error('Card verification failed: invalid Ed25519 merchant signature');
  }

  if (typeof card.cardId !== 'string' || !card.cardId.trim()) {
    throw new Error('Invalid card: cardId is required');
  }
  if (typeof card.merchantDid !== 'string' || !card.merchantDid.startsWith('did:web:')) {
    throw new Error('Invalid card: merchantDid must be a valid did:web identifier');
  }
  if (!Array.isArray(card.components) || card.components.length === 0) {
    throw new Error('Invalid card: components array must be non-empty');
  }
  if (card.components.length > config.maxComponents) {
    throw new Error(`Card exceeds maximum allowed components (${config.maxComponents})`);
  }

  const nodes = card.components.map((comp, index) => {
    if (!comp || typeof comp.type !== 'string') {
      throw new Error(`Invalid component at index ${index}: missing type`);
    }
    if (!ALLOWED_COMPONENT_TYPES.has(comp.type)) {
      throw new Error(`Unsupported or unsafe component type "${comp.type}" at index ${index}`);
    }
    if (typeof comp.id !== 'string' || !comp.id.trim()) {
      throw new Error(`Invalid component at index ${index}: component id is required`);
    }

    const props = comp.props && typeof comp.props === 'object' ? { ...comp.props } : {};
    assertZeroHtmlStrings(props, `components[${index}].props`);

    const rawActions = Array.isArray(comp.actions) ? comp.actions : [];
    if (rawActions.length > config.maxActions) {
      throw new Error(`Component "${comp.id}" exceeds maximum allowed actions (${config.maxActions})`);
    }

    const actions = rawActions.map((act, actIdx) => {
      if (!act || !ALLOWED_ACTION_TYPES.has(act.type)) {
        throw new Error(`Unsupported action type "${act?.type}" in component "${comp.id}"`);
      }
      if (typeof act.actionId !== 'string' || !act.actionId.trim()) {
        throw new Error(`Missing actionId at components[${index}].actions[${actIdx}]`);
      }
      if (typeof act.label !== 'string' || !act.label.trim()) {
        throw new Error(`Missing label at components[${index}].actions[${actIdx}]`);
      }
      assertZeroHtmlStrings(act.label, `components[${index}].actions[${actIdx}].label`);
      const actPayload = act.payload && typeof act.payload === 'object' ? { ...act.payload } : {};
      assertZeroHtmlStrings(actPayload, `components[${index}].actions[${actIdx}].payload`);

      return {
        actionId: act.actionId,
        type: act.type,
        label: act.label,
        payload: actPayload
      };
    });

    return {
      nodeId: comp.id,
      widget: `native:${comp.type}`,
      props,
      actions
    };
  });

  return {
    viewType: 'SONARAIM_NATIVE_CARD',
    cardId: card.cardId,
    merchantDid: card.merchantDid,
    verifiedSignature: true,
    nodes
  };
}

/**
 * Creates a cryptographically signed user action response payload to send back to a merchant.
 * @param {{
 *   cardId: string,
 *   actionId: string,
 *   userDid: string,
 *   merchantDid: string,
 *   parameters?: Record<string, unknown>,
 *   timestamp?: number
 * }} actionInput - User interaction context.
 * @param {string | crypto.KeyObject} userPrivateKey - User Ed25519 private key.
 * @returns {{
 *   actionPayload: {
 *     cardId: string,
 *     actionId: string,
 *     userDid: string,
 *     merchantDid: string,
 *     parameters: Record<string, unknown>,
 *     timestamp: number
 *   },
 *   signature: string
 * }}
 */
export function createSignedCardAction(actionInput, userPrivateKey) {
  if (!actionInput || typeof actionInput.cardId !== 'string' || typeof actionInput.actionId !== 'string') {
    throw new Error('Invalid action input: cardId and actionId are required');
  }
  if (typeof actionInput.userDid !== 'string' || !actionInput.userDid.startsWith('did:sonaraim:')) {
    throw new Error('Invalid action input: userDid must start with did:sonaraim:');
  }

  const actionPayload = {
    cardId: actionInput.cardId,
    actionId: actionInput.actionId,
    userDid: actionInput.userDid,
    merchantDid: actionInput.merchantDid,
    parameters: actionInput.parameters ? { ...actionInput.parameters } : {},
    timestamp: typeof actionInput.timestamp === 'number' ? actionInput.timestamp : Date.now()
  };

  assertZeroHtmlStrings(actionPayload.parameters, 'actionPayload.parameters');

  const keyObject = typeof userPrivateKey === 'string'
    ? crypto.createPrivateKey(userPrivateKey)
    : userPrivateKey;

  const canonicalBytes = Buffer.from(canonicalizeJson(actionPayload), 'utf8');
  const signature = crypto.sign(null, canonicalBytes, keyObject).toString('base64');

  return { actionPayload, signature };
}

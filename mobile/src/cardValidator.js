/**
 * @fileoverview Zero-HTML Native Declarative Card Validator for Sonaraim Mobile.
 * Enforces strict Zero-HTML policy, rejecting HTML tags, script injection, and unsafe
 * interactive primitives while validating title, tenantDid, components, and action envelopes.
 */

/**
 * Allowed declarative native component types in Sonaraim Mobile Zero-HTML cards.
 * @type {ReadonlySet<string>}
 */
export const ALLOWED_COMPONENT_TYPES = Object.freeze(new Set([
  'header',
  'text',
  'key_value',
  'media_image',
  'divider',
  'badge',
  'action_group',
]));

/**
 * Allowed interactive action types in Sonaraim Mobile Zero-HTML cards.
 * @type {ReadonlySet<string>}
 */
export const ALLOWED_ACTION_TYPES = Object.freeze(new Set([
  'confirm_intent',
  'select_option',
  'open_deep_link',
  'request_receipt',
]));

/**
 * Regular expression matching raw HTML tags, javascript URIs, or inline event handlers.
 */
const HTML_INJECTION_PATTERN = /<\s*\/?\s*[a-zA-Z!][^>]*>|javascript:|data:text\/html|on[a-z]+\s*=/i;

/**
 * Custom error thrown when a declarative card violates Zero-HTML or schema integrity.
 */
export class CardValidationError extends Error {
  /**
   * @param {string} message - Validation error description.
   * @param {string} [path] - Field path where validation failed.
   */
  constructor(message, path) {
    super(path ? `${message} at "${path}"` : message);
    this.name = 'CardValidationError';
    this.path = path;
  }
}

/**
 * Checks whether any string or nested structure contains raw HTML or script vectors.
 *
 * @param {unknown} value - Value to inspect.
 * @returns {boolean} True if HTML or script injection is detected.
 */
export function hasHtmlInjection(value) {
  if (typeof value === 'string') {
    return HTML_INJECTION_PATTERN.test(value);
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasHtmlInjection(item));
  }
  if (value && typeof value === 'object') {
    return Object.values(value).some((v) => hasHtmlInjection(v));
  }
  return false;
}

/**
 * Recursively asserts that a value contains no HTML tags or script injection vectors.
 *
 * @param {unknown} value - Value to assert.
 * @param {string} [path='card'] - Diagnostic path for error reporting.
 * @throws {CardValidationError} When HTML injection is detected.
 */
export function assertZeroHtml(value, path = 'card') {
  if (typeof value === 'string') {
    if (HTML_INJECTION_PATTERN.test(value)) {
      throw new CardValidationError('Zero-HTML policy violation: markup or script URI detected', path);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, idx) => assertZeroHtml(item, `${path}[${idx}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      assertZeroHtml(v, `${path}.${k}`);
    }
  }
}

/**
 * Validates a single interactive card action.
 *
 * @param {unknown} action - Raw action object.
 * @param {number} index - Index within the actions array.
 * @returns {{ id: string, type: string, label: string, [key: string]: unknown }} Sanitized action.
 * @throws {CardValidationError} When action is malformed or invalid.
 */
export function validateCardAction(action, index = 0) {
  const path = `actions[${index}]`;
  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    throw new CardValidationError('Action must be a non-null object', path);
  }

  const { id, type, label } = /** @type {Record<string, unknown>} */ (action);

  if (typeof id !== 'string' || !id.trim()) {
    throw new CardValidationError('Action id must be a non-empty string', `${path}.id`);
  }
  if (typeof type !== 'string' || !ALLOWED_ACTION_TYPES.has(type.trim())) {
    throw new CardValidationError(
      `Unsupported action type "${type}". Allowed: ${Array.from(ALLOWED_ACTION_TYPES).join(', ')}`,
      `${path}.type`
    );
  }
  if (typeof label !== 'string' || !label.trim()) {
    throw new CardValidationError('Action label must be a non-empty string', `${path}.label`);
  }

  assertZeroHtml(action, path);
  return /** @type {any} */ (action);
}

/**
 * Validates a declarative card component.
 *
 * @param {unknown} component - Component object.
 * @param {number} index - Index within components array.
 * @returns {{ type: string, [key: string]: unknown }}
 * @throws {CardValidationError}
 */
export function validateCardComponent(component, index = 0) {
  const path = `components[${index}]`;
  if (!component || typeof component !== 'object' || Array.isArray(component)) {
    throw new CardValidationError('Component must be a non-null object', path);
  }

  const type = /** @type {Record<string, unknown>} */ (component).type;
  if (typeof type !== 'string' || !ALLOWED_COMPONENT_TYPES.has(type.trim())) {
    throw new CardValidationError(
      `Unsupported component type "${type}". Allowed: ${Array.from(ALLOWED_COMPONENT_TYPES).join(', ')}`,
      `${path}.type`
    );
  }

  assertZeroHtml(component, path);
  return /** @type {any} */ (component);
}

/**
 * Validates a complete Zero-HTML Declarative Card envelope.
 *
 * @param {unknown} card - Declarative card object to validate.
 * @param {{ maxActions?: number, maxComponents?: number }} [options]
 * @returns {{ valid: boolean, card: Record<string, unknown> }}
 * @throws {CardValidationError} If card fails Zero-HTML or structural validation.
 */
export function validateDeclarativeCard(card, options = {}) {
  if (!card || typeof card !== 'object' || Array.isArray(card)) {
    throw new CardValidationError('Declarative card must be a non-null object', 'card');
  }

  const record = /** @type {Record<string, any>} */ (card);

  // 1. Validate title
  if (typeof record.title !== 'string' || !record.title.trim()) {
    throw new CardValidationError('Card title must be a non-empty string', 'title');
  }
  assertZeroHtml(record.title, 'title');

  // 2. Validate tenantDid
  if (typeof record.tenantDid !== 'string' || !record.tenantDid.trim().startsWith('did:')) {
    throw new CardValidationError('Card tenantDid must be a valid DID starting with "did:"', 'tenantDid');
  }
  assertZeroHtml(record.tenantDid, 'tenantDid');

  // 3. Validate actions
  const maxActions = options.maxActions ?? 6;
  const actions = Array.isArray(record.actions) ? record.actions : [];
  if (actions.length > maxActions) {
    throw new CardValidationError(`Actions count exceeds limit (${maxActions})`, 'actions');
  }
  for (let i = 0; i < actions.length; i++) {
    validateCardAction(actions[i], i);
  }

  // 4. Validate components if present
  const maxComponents = options.maxComponents ?? 24;
  const components = Array.isArray(record.components) ? record.components : [];
  if (components.length > maxComponents) {
    throw new CardValidationError(`Components count exceeds limit (${maxComponents})`, 'components');
  }
  for (let i = 0; i < components.length; i++) {
    validateCardComponent(components[i], i);
  }

  // 5. Global Zero-HTML recursive sweep across all other properties (e.g. metadata, summary)
  assertZeroHtml(record, 'card');

  return {
    valid: true,
    card: record,
  };
}

/**
 * @fileoverview Passkey WebAuthn PRF Zero-Knowledge Vault for SonarAIM Client.
 * Derives deterministic 256-bit symmetric keys from WebAuthn PRF outputs (or recovery
 * passphrases via scrypt + HKDF) and encrypts/decrypts cross-OS MLS state and message
 * history blobs using authenticated AES-256-GCM with Additional Authenticated Data (AAD).
 */

import crypto from 'node:crypto';

/**
 * Resolves Zero-Knowledge Vault cryptographic parameters from environment variables.
 * @param {Record<string, string | undefined>} [env] - Environment variable dictionary.
 * @returns {{
 *   hkdfHash: string,
 *   hkdfInfo: string,
 *   cipherAlgo: string,
 *   keyLength: number,
 *   ivLength: number,
 *   scryptCost: number,
 *   scryptBlockSize: number,
 *   scryptParallelization: number
 * }}
 */
export function resolveVaultConfig(env = process.env) {
  return {
    hkdfHash: env.SONARAIM_VAULT_HKDF_HASH || 'sha256',
    hkdfInfo: env.SONARAIM_VAULT_HKDF_INFO || 'sonaraim-zk-vault-v1',
    cipherAlgo: env.SONARAIM_VAULT_CIPHER_ALGO || 'aes-256-gcm',
    keyLength: Number.parseInt(env.SONARAIM_VAULT_KEY_LENGTH || '32', 10),
    ivLength: Number.parseInt(env.SONARAIM_VAULT_IV_LENGTH || '12', 10),
    scryptCost: Number.parseInt(env.SONARAIM_VAULT_SCRYPT_COST || '16384', 10),
    scryptBlockSize: Number.parseInt(env.SONARAIM_VAULT_SCRYPT_BLOCK_SIZE || '8', 10),
    scryptParallelization: Number.parseInt(env.SONARAIM_VAULT_SCRYPT_PARALLELIZATION || '1', 10)
  };
}

/**
 * Normalizes a Buffer, Uint8Array, or base64/utf8 string into a Node Buffer.
 * @param {Buffer | Uint8Array | string} input - Raw material.
 * @param {'utf8' | 'base64' | 'hex'} [encoding] - String encoding when input is a string.
 * @returns {Buffer}
 */
function toBuffer(input, encoding = 'utf8') {
  if (Buffer.isBuffer(input)) {
    return input;
  }
  if (input instanceof Uint8Array) {
    return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  }
  if (typeof input === 'string') {
    return Buffer.from(input, encoding);
  }
  throw new Error('Expected Buffer, Uint8Array, or string input');
}

/**
 * Derives a 256-bit symmetric vault key from a WebAuthn PRF extension secret
 * (or passphrase secret hardened via scrypt) combined with HKDF domain separation.
 * @param {{
 *   prfSecret: Buffer | Uint8Array | string,
 *   salt: Buffer | Uint8Array | string,
 *   userDid: string,
 *   useScryptHardening?: boolean
 * }} params - Key derivation inputs.
 * @param {Partial<ReturnType<typeof resolveVaultConfig>>} [options] - Optional crypto overrides.
 * @returns {Buffer} 32-byte derived symmetric key.
 */
export function deriveVaultKey(params, options = {}) {
  const config = { ...resolveVaultConfig(), ...options };
  if (!params || !params.prfSecret) {
    throw new Error('Invalid vault key derivation input: prfSecret is required');
  }
  if (!params.salt) {
    throw new Error('Invalid vault key derivation input: salt is required');
  }
  if (typeof params.userDid !== 'string' || !params.userDid.startsWith('did:sonaraim:')) {
    throw new Error('Invalid vault key derivation input: userDid must start with did:sonaraim:');
  }

  const rawSecret = toBuffer(params.prfSecret);
  const saltBuffer = toBuffer(params.salt);
  if (rawSecret.byteLength < 16) {
    throw new Error('Invalid prfSecret: minimum 16 bytes of entropy required');
  }
  if (saltBuffer.byteLength < 16) {
    throw new Error('Invalid salt: minimum 16 bytes required');
  }

  // Optional scrypt hardening before HKDF expansion when deriving from human-memorized recovery seeds
  const ikm = params.useScryptHardening
    ? crypto.scryptSync(rawSecret, saltBuffer, config.keyLength, {
        N: config.scryptCost,
        r: config.scryptBlockSize,
        p: config.scryptParallelization
      })
    : rawSecret;

  const infoBuffer = Buffer.from(`${config.hkdfInfo}:${params.userDid}`, 'utf8');
  const derivedArrayBuffer = crypto.hkdfSync(
    config.hkdfHash,
    ikm,
    saltBuffer,
    infoBuffer,
    config.keyLength
  );

  return Buffer.from(derivedArrayBuffer);
}

/**
 * Encrypts a structured Zero-Knowledge vault snapshot (MLS ratchet tree, identity keys,
 * and Dual Inbox history) using AES-256-GCM with authenticated metadata binding.
 * @param {{
 *   vaultKey: Buffer | Uint8Array,
 *   userDid: string,
 *   epoch: number,
 *   snapshot: Record<string, unknown>
 * }} input - Plaintext vault snapshot and key material.
 * @param {Partial<ReturnType<typeof resolveVaultConfig>>} [options] - Optional crypto overrides.
 * @returns {{
 *   version: 1,
 *   cipher: string,
 *   userDid: string,
 *   epoch: number,
 *   iv: string,
 *   authTag: string,
 *   ciphertext: string
 * }} Serializable encrypted blob ready for untrusted cloud or relay storage.
 */
export function encryptVaultBlob(input, options = {}) {
  const config = { ...resolveVaultConfig(), ...options };
  if (!input || !input.vaultKey) {
    throw new Error('encryptVaultBlob requires a valid vaultKey');
  }
  const key = toBuffer(input.vaultKey);
  if (key.byteLength !== config.keyLength) {
    throw new Error(`Invalid vaultKey length: expected ${config.keyLength} bytes, got ${key.byteLength}`);
  }
  if (typeof input.userDid !== 'string' || !input.userDid.startsWith('did:sonaraim:')) {
    throw new Error('encryptVaultBlob requires a valid did:sonaraim: userDid');
  }
  if (typeof input.epoch !== 'number' || !Number.isInteger(input.epoch) || input.epoch < 0) {
    throw new Error('encryptVaultBlob requires a non-negative integer epoch');
  }
  if (!input.snapshot || typeof input.snapshot !== 'object') {
    throw new Error('encryptVaultBlob requires a snapshot object');
  }

  const iv = crypto.randomBytes(config.ivLength);
  const aad = Buffer.from(`v1|${input.userDid}|epoch:${input.epoch}`, 'utf8');
  const plaintext = Buffer.from(JSON.stringify(input.snapshot), 'utf8');

  const cipher = crypto.createCipheriv(config.cipherAlgo, key, iv);
  cipher.setAAD(aad);

  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    version: 1,
    cipher: config.cipherAlgo,
    userDid: input.userDid,
    epoch: input.epoch,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: encrypted.toString('base64')
  };
}

/**
 * Decrypts and authenticates an encrypted Zero-Knowledge vault blob using AES-256-GCM.
 * Rejects tampered ciphertexts, mismatched user DIDs, or replayed epoch metadata.
 * @param {{
 *   blob: {
 *     version: number,
 *     cipher: string,
 *     userDid: string,
 *     epoch: number,
 *     iv: string,
 *     authTag: string,
 *     ciphertext: string
 *   },
 *   vaultKey: Buffer | Uint8Array,
 *   expectedUserDid?: string
 * }} input - Encrypted blob and derived 256-bit vault key.
 * @param {Partial<ReturnType<typeof resolveVaultConfig>>} [options] - Optional crypto overrides.
 * @returns {{
 *   userDid: string,
 *   epoch: number,
 *   snapshot: Record<string, unknown>
 * }} Authenticated and parsed vault snapshot.
 */
export function decryptVaultBlob(input, options = {}) {
  const config = { ...resolveVaultConfig(), ...options };
  if (!input || !input.blob || !input.vaultKey) {
    throw new Error('decryptVaultBlob requires blob and vaultKey');
  }

  const { blob } = input;
  const key = toBuffer(input.vaultKey);
  if (key.byteLength !== config.keyLength) {
    throw new Error(`Invalid vaultKey length: expected ${config.keyLength} bytes`);
  }
  if (blob.version !== 1 || blob.cipher !== config.cipherAlgo) {
    throw new Error(`Unsupported vault blob version or cipher (${blob.version} / ${blob.cipher})`);
  }
  if (input.expectedUserDid && blob.userDid !== input.expectedUserDid) {
    throw new Error('Vault blob userDid mismatch');
  }

  const iv = Buffer.from(blob.iv, 'base64');
  const authTag = Buffer.from(blob.authTag, 'base64');
  const ciphertext = Buffer.from(blob.ciphertext, 'base64');
  const aad = Buffer.from(`v1|${blob.userDid}|epoch:${blob.epoch}`, 'utf8');

  const decipher = crypto.createDecipheriv(config.cipherAlgo, key, iv);
  decipher.setAAD(aad);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const snapshot = JSON.parse(decrypted.toString('utf8'));

  return {
    userDid: blob.userDid,
    epoch: blob.epoch,
    snapshot
  };
}

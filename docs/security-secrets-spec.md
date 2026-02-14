# Security & Secrets Specification

## Purpose

Define how API keys and master passphrase flows are handled for local single-user v1.

## 1. Security Model

This application is local-first and single-user, but still handles provider credentials. The design goal is practical local security with clear boundaries.

### Threats addressed

- accidental plaintext key exposure in DB backups,
- accidental logging of keys,
- unauthorized use if DB file is copied without passphrase.

### Threats not fully addressed (v1)

- full host compromise,
- memory scraping by malware,
- shoulder surfing at unlock screen.

## 2. Key Storage Strategy

- Provider API keys are encrypted before database write.
- Ciphertext and required metadata are stored in SQLite.
- Plaintext keys are never persisted.

Recommended envelope fields per key record:

- `encryptedKey` (base64)
- `salt` (base64)
- `iv`/`nonce` (base64)
- `kdfParams` (e.g., scrypt/argon settings)
- `cipherVersion`

## 3. Master Passphrase Lifecycle

### 3.1 First run setup

- user is presented with setup screen,
- user enters and confirms passphrase,
- app derives verifier hash and stores verifier metadata,
- passphrase itself is not stored.

### 3.2 Startup unlock

- app starts in locked mode,
- in-browser unlock screen requests passphrase once,
- on success, server derives and caches in-memory encryption context,
- encrypted keys may now be decrypted for use.

### 3.3 Session behavior

- unlock lasts until server restart,
- no per-action re-prompt in v1,
- lock state can optionally be exposed in status endpoint.

## 4. Cryptographic Guidance

Suggested defaults for v1:

- KDF: scrypt (or Argon2id if dependency and portability are acceptable)
- Cipher: AES-256-GCM (authenticated encryption)
- Unique random salt and nonce per encrypted key
- Constant-time compare for verifier checks

All random values must use Node crypto secure RNG.

## 5. Data Handling Rules

Must do:

- redact secrets in logs and API responses,
- avoid returning ciphertext internals to client unless needed,
- validate passphrase inputs server-side,
- store only minimum metadata required for decryption.

Must not do:

- print plaintext keys or passphrase,
- persist passphrase to disk,
- include secrets in telemetry payloads.

## 6. API Surface Implications

Route families needed:

- setup routes: check initialized state, create passphrase verifier
- unlock routes: attempt unlock, report lock status
- key routes: create/update encrypted provider key under unlocked state

All sensitive routes must enforce unlocked precondition.

## 7. Migration and Rotation Considerations

Future-proofing recommendations:

- include `cipherVersion` for algorithm upgrades,
- support passphrase rotation workflow (decrypt-reencrypt keys),
- include key record timestamps for forensic visibility.

## 8. Incident Recovery (Local)

If passphrase is forgotten:

- encrypted keys are unrecoverable by design,
- provide documented reset process:
  1) clear verifier,
  2) delete encrypted key records,
  3) re-run first-time setup,
  4) re-enter provider keys.

## 9. Validation Checklist

Before feature completion, verify:

- DB never contains plaintext provider keys,
- failed unlock does not alter lock state,
- successful unlock allows model execution,
- restart returns app to locked state,
- logs and analytics remain secret-free.

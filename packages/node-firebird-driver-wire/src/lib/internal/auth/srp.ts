import { createHash, randomBytes } from 'node:crypto';

const SRP_KEY_SIZE = 128;
const SRP_SALT_SIZE = 32;
const EXPECTED_AUTH_DATA_LENGTH = (SRP_SALT_SIZE + SRP_KEY_SIZE + 2) * 2;
const PRIME = BigInt(
  `0xE67D2E994B2F900C3F41F08F5BB2627ED0D49EE1FE767A52EFCD565CD6E768812C3E1E9CE8F0A8BEA6CB13CD29DDEBF7A96D4A93B55D488DF099A15C89DCB0640738EB2CBDD9A8F7BAB561AB1B0DC1C6CDABF303264A08D1BCA932D1F1EE428B619D970F342ABA9A65793B8B2F041AE5364350C16F735F56ECBCA87BD57B29E7`,
);
const GENERATOR = 2n;
const K = BigInt('1277432915985975349439481660349303019122249719989');

function sha1(...parts: Buffer[]): Buffer {
  const hash = createHash('sha1');
  for (const part of parts) {
    hash.update(part);
  }
  return hash.digest();
}

function hash(algorithm: string, ...parts: Buffer[]): Buffer {
  const digest = createHash(algorithm.toLowerCase());

  for (const part of parts) {
    digest.update(part);
  }

  return digest.digest();
}

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let currentBase = ((base % modulus) + modulus) % modulus;
  let currentExponent = exponent;

  while (currentExponent > 0n) {
    if ((currentExponent & 1n) === 1n) {
      result = (result * currentBase) % modulus;
    }

    currentExponent >>= 1n;
    currentBase = (currentBase * currentBase) % modulus;
  }

  return result;
}

function bigIntFromBytes(value: Buffer): bigint {
  return value.length === 0 ? 0n : BigInt(`0x${value.toString('hex')}`);
}

function stripLeadingZeroes(value: Buffer): Buffer {
  let offset = 0;

  while (offset < value.length - 1 && value[offset] === 0) {
    offset++;
  }

  return value.subarray(offset);
}

function bigIntToBytes(value: bigint): Buffer {
  if (value === 0n) {
    return Buffer.from([0]);
  }

  let hex = value.toString(16);

  if (hex.length % 2 !== 0) {
    hex = `0${hex}`;
  }

  return stripLeadingZeroes(Buffer.from(hex, 'hex'));
}

function pad(value: bigint): Buffer {
  const bytes = bigIntToBytes(value);

  if (bytes.length > SRP_KEY_SIZE) {
    return bytes.subarray(bytes.length - SRP_KEY_SIZE);
  }

  return bytes;
}

function getSecret(): bigint {
  return bigIntFromBytes(randomBytes(16));
}

function getUserHash(user: string, password: string, salt: Buffer): bigint {
  return bigIntFromBytes(sha1(salt, sha1(Buffer.from(`${user}:${password}`, 'utf8'))));
}

function getScramble(clientPublicKey: bigint, serverPublicKey: bigint): bigint {
  return bigIntFromBytes(sha1(pad(clientPublicKey), pad(serverPublicKey)));
}

export class SrpClientSession {
  private readonly privateKey = getSecret();
  private readonly publicKey = modPow(GENERATOR, this.privateKey, PRIME);
  private sessionKey?: Buffer;

  constructor(private readonly proofHashAlgorithm: 'sha1' | 'sha256') {}

  getPublicKeyHex(): Buffer {
    return Buffer.from(pad(this.publicKey).toString('hex').toUpperCase(), 'ascii');
  }

  getSessionKey(): Buffer | undefined {
    return this.sessionKey;
  }

  createClientProof(user: string, password: string, authData: Buffer): Buffer {
    if (authData.length === 0) {
      throw new Error('Firebird server did not provide SRP authentication data.');
    }

    if (authData.length > EXPECTED_AUTH_DATA_LENGTH) {
      throw new Error(`Firebird server returned oversized SRP data (${authData.length}).`);
    }

    const saltLength = authData.readUInt16LE(0);
    if (saltLength > SRP_SALT_SIZE * 2) {
      throw new Error(`Firebird server returned oversized SRP salt (${saltLength}).`);
    }

    const salt = authData.subarray(2, 2 + saltLength);
    const keyLength = authData.readUInt16LE(2 + saltLength);
    const keyStart = 4 + saltLength;
    if (authData.length - keyStart !== keyLength) {
      throw new Error('Firebird server returned inconsistent SRP key data.');
    }

    const serverPublicKeyHex = authData.subarray(keyStart).toString('ascii');
    const serverPublicKey = BigInt(`0x${serverPublicKeyHex}`);
    const scramble = getScramble(this.publicKey, serverPublicKey);
    const x = getUserHash(user, password, salt);
    const gx = modPow(GENERATOR, x, PRIME);
    const kgx = (K * gx) % PRIME;
    const diff = (((serverPublicKey - kgx) % PRIME) + PRIME) % PRIME;
    const ux = (scramble * x) % PRIME;
    const aux = (this.privateKey + ux) % PRIME;
    const sessionSecret = modPow(diff, aux, PRIME);
    const sessionKey = sha1(bigIntToBytes(sessionSecret));

    const n1 = bigIntFromBytes(sha1(bigIntToBytes(PRIME)));
    const n2 = bigIntFromBytes(sha1(bigIntToBytes(GENERATOR)));
    const proof = hash(
      this.proofHashAlgorithm,
      bigIntToBytes(modPow(n1, n2, PRIME)),
      stripLeadingZeroes(sha1(Buffer.from(user, 'utf8'))),
      salt,
      bigIntToBytes(this.publicKey),
      bigIntToBytes(serverPublicKey),
      sessionKey,
    );

    this.sessionKey = sessionKey;

    return Buffer.from(proof.toString('hex').toUpperCase(), 'ascii');
  }
}

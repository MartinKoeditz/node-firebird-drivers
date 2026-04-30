import { Buffer } from 'node:buffer';

const ROTATES = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1];
const ITOA64 = Buffer.from('./0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 'ascii');
const FB_SALT = 754712576;
const ITERATIONS = 25;

const PC1ROT = Array.from({ length: 16 }, () => Array(16).fill(0n));
const PC2ROT = Array.from({ length: 2 }, () => Array.from({ length: 16 }, () => Array(16).fill(0n)));
const SPE = Array.from({ length: 8 }, () => Array(64).fill(0n));
const CF6464 = Array.from({ length: 16 }, () => Array(16).fill(0n));

function initPerm(perm: bigint[][], p: number[]): void {
  for (let k = 0; k < 64; k++) {
    const l = p[k] - 1;
    if (l < 0) {
      continue;
    }
    const i = l >> 2;
    const bit = 1 << (l & 0x03);
    for (let j = 0; j < 16; j++) {
      const s = (k & 0x07) + ((7 - (k >> 3)) << 3);
      if ((j & bit) !== 0) {
        perm[i][j] |= 1n << BigInt(s);
      }
    }
  }
}

function toSixBit(num: bigint): bigint {
  return (
    ((num << 26n) & 0xfc000000fc000000n) |
    ((num << 12n) & 0xfc000000fc0000n) |
    ((num >> 2n) & 0xfc000000fc00n) |
    ((num >> 16n) & 0xfc000000fcn)
  );
}

function perm6464(c: bigint, p: bigint[][]): bigint {
  let out = 0n;
  let value = c;
  for (let i = 7; i >= 0; i--) {
    const t = Number(value & 0xffn);
    value >>= 8n;
    out |= p[i << 1][t & 0x0f];
    out |= p[(i << 1) + 1][t >> 4];
  }
  return out;
}

function desSetKey(keyword: bigint): bigint[] {
  let key = perm6464(keyword, PC1ROT);
  const keySchedule = new Array<bigint>(16);
  keySchedule[0] = key & ~0x0303030300000000n;

  for (let i = 1; i < 16; i++) {
    key = perm6464(key, PC2ROT[ROTATES[i] - 1]);
    keySchedule[i] = key & ~0x0303030300000000n;
  }

  return keySchedule;
}

function opSalt(value: bigint): bigint {
  let result = ((value >> 32n) ^ value) & BigInt(FB_SALT);
  result |= result << 32n;
  return result;
}

function opSpe(value: bigint): bigint {
  return (
    SPE[0][Number((value >> 58n) & 0x3fn)] +
    SPE[1][Number((value >> 50n) & 0x3fn)] +
    SPE[2][Number((value >> 42n) & 0x3fn)] +
    SPE[3][Number((value >> 34n) & 0x3fn)] +
    SPE[4][Number((value >> 26n) & 0x3fn)] +
    SPE[5][Number((value >> 18n) & 0x3fn)] +
    SPE[6][Number((value >> 10n) & 0x3fn)] +
    SPE[7][Number((value >> 2n) & 0x3fn)]
  );
}

function desCipher(keySchedule: bigint[]): bigint {
  let left = 0n;
  let right = 0n;

  for (let iteration = 0; iteration < ITERATIONS; iteration++) {
    for (let loopCount = 0; loopCount < 8; loopCount++) {
      left ^= opSpe(opSalt(right) ^ right ^ keySchedule[loopCount << 1]);
      right ^= opSpe(opSalt(left) ^ left ^ keySchedule[(loopCount << 1) + 1]);
    }
    [left, right] = [right, left];
  }

  let value =
    ((((left >> 35n) & 0x0f0f0f0fn) | ((left << 1n) & 0xf0f0f0f0n)) << 32n) |
    ((right >> 35n) & 0x0f0f0f0fn) |
    ((right << 1n) & 0xf0f0f0f0n);

  value = perm6464(value, CF6464);
  return value;
}

function initializeLegacyTables(): void {
  const perm = new Array<number>(64).fill(0);
  const temp = new Array<number>(64).fill(0);

  const PC1 = [
    57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18, 10, 2, 59, 51, 43, 35, 27, 19, 11, 3, 60, 52, 44, 36, 63, 55,
    47, 39, 31, 23, 15, 7, 62, 54, 46, 38, 30, 22, 14, 6, 61, 53, 45, 37, 29, 21, 13, 5, 28, 20, 12, 4,
  ];
  const PC2 = [
    9, 18, 14, 17, 11, 24, 1, 5, 22, 25, 3, 28, 15, 6, 21, 10, 35, 38, 23, 19, 12, 4, 26, 8, 43, 54, 16, 7, 27, 20, 13,
    2, 0, 0, 41, 52, 31, 37, 47, 55, 0, 0, 30, 40, 51, 45, 33, 48, 0, 0, 44, 49, 39, 56, 34, 53, 0, 0, 46, 42, 50, 36,
    29, 32,
  ];

  for (let i = 0; i < 64; i++) {
    let k = PC2[i];
    if (k === 0) {
      continue;
    }
    if (k % 28 < 1) {
      k -= 28;
    }
    k = PC1[k];
    k--;
    k = (k | 0x07) - (k & 0x07);
    k++;
    perm[i] = k;
  }
  initPerm(PC1ROT, perm);

  for (let j = 0; j < 2; j++) {
    perm.fill(0);
    temp.fill(0);
    for (let i = 0; i < 64; i++) {
      const k = PC2[i];
      if (k !== 0) {
        temp[k - 1] = i + 1;
      }
    }
    for (let i = 0; i < 64; i++) {
      let k = PC2[i];
      if (k === 0) {
        continue;
      }
      k += j;
      if (k % 28 <= j) {
        k -= 28;
      }
      perm[i] = temp[k];
    }
    initPerm(PC2ROT[j], perm);
  }

  const IP = [
    58, 50, 42, 34, 26, 18, 10, 2, 60, 52, 44, 36, 28, 20, 12, 4, 62, 54, 46, 38, 30, 22, 14, 6, 64, 56, 48, 40, 32, 24,
    16, 8, 57, 49, 41, 33, 25, 17, 9, 1, 59, 51, 43, 35, 27, 19, 11, 3, 61, 53, 45, 37, 29, 21, 13, 5, 63, 55, 47, 39,
    31, 23, 15, 7,
  ];
  const expandTr = [
    32, 1, 2, 3, 4, 5, 4, 5, 6, 7, 8, 9, 8, 9, 10, 11, 12, 13, 12, 13, 14, 15, 16, 17, 16, 17, 18, 19, 20, 21, 20, 21,
    22, 23, 24, 25, 24, 25, 26, 27, 28, 29, 28, 29, 30, 31, 32, 1,
  ];

  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      let k = j < 2 ? 0 : IP[expandTr[i * 6 + j - 2] - 1];
      if (k > 32) {
        k -= 32;
      } else if (k > 0) {
        k--;
      }
      if (k > 0) {
        k--;
        k = (k | 0x07) - (k & 0x07);
        k++;
      }
      perm[i * 8 + j] = k;
    }
  }

  const CIFP = [
    1, 2, 3, 4, 17, 18, 19, 20, 5, 6, 7, 8, 21, 22, 23, 24, 9, 10, 11, 12, 25, 26, 27, 28, 13, 14, 15, 16, 29, 30, 31,
    32, 33, 34, 35, 36, 49, 50, 51, 52, 37, 38, 39, 40, 53, 54, 55, 56, 41, 42, 43, 44, 57, 58, 59, 60, 45, 46, 47, 48,
    61, 62, 63, 64,
  ];

  for (let i = 0; i < 64; i++) {
    let k = IP[CIFP[i] - 1];
    k--;
    k = (k | 0x07) - (k & 0x07);
    k++;
    perm[k - 1] = i + 1;
  }
  initPerm(CF6464, perm);

  const S = [
    [
      14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7, 0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11, 9, 5, 3, 8, 4, 1,
      14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0, 15, 12, 8, 2, 4, 9, 1, 7, 5, 11, 3, 14, 10, 0, 6, 13,
    ],
    [
      15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10, 3, 13, 4, 7, 15, 2, 8, 14, 12, 0, 1, 10, 6, 9, 11, 5, 0, 14,
      7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15, 13, 8, 10, 1, 3, 15, 4, 2, 11, 6, 7, 12, 0, 5, 14, 9,
    ],
    [
      10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8, 13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12, 11, 15, 1, 13, 6,
      4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7, 1, 10, 13, 0, 6, 9, 8, 7, 4, 15, 14, 3, 11, 5, 2, 12,
    ],
    [
      7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15, 13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1, 10, 14, 9, 10, 6,
      9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4, 3, 15, 0, 6, 10, 1, 13, 8, 9, 4, 5, 11, 12, 7, 2, 14,
    ],
    [
      2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9, 14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10, 3, 9, 8, 6, 4, 2,
      1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14, 11, 8, 12, 7, 1, 14, 2, 13, 6, 15, 0, 9, 10, 4, 5, 3,
    ],
    [
      12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11, 10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14, 0, 11, 3, 8, 9, 14,
      15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6, 4, 3, 2, 12, 9, 5, 15, 10, 11, 14, 1, 7, 6, 0, 8, 13,
    ],
    [
      4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1, 13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12, 2, 15, 8, 6, 1, 4,
      11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2, 6, 11, 13, 8, 1, 4, 10, 7, 9, 5, 0, 15, 14, 2, 3, 12,
    ],
    [
      13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7, 1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11, 0, 14, 9, 2, 7, 11,
      4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8, 2, 1, 14, 7, 4, 10, 8, 13, 15, 12, 9, 0, 3, 5, 6, 11,
    ],
  ];
  const P32TR = [
    16, 7, 20, 21, 29, 12, 28, 17, 1, 15, 23, 26, 5, 18, 31, 10, 2, 8, 24, 14, 32, 27, 3, 9, 19, 13, 30, 6, 22, 11, 4,
    25,
  ];

  for (let i = 0; i < 48; i++) {
    perm[i] = P32TR[expandTr[i] - 1];
  }
  for (let t = 0; t < 8; t++) {
    for (let j = 0; j < 64; j++) {
      let k =
        ((j & 0x01) << 5) |
        (((j >> 1) & 0x01) << 3) |
        (((j >> 2) & 0x01) << 2) |
        (((j >> 3) & 0x01) << 1) |
        ((j >> 4) & 0x01) |
        (((j >> 5) & 0x01) << 4);
      k = S[t][k];
      k = ((k >> 3) & 0x01) | (((k >> 2) & 0x01) << 1) | (((k >> 1) & 0x01) << 2) | ((k & 0x01) << 3);
      temp.fill(0);
      for (let i = 0; i < 4; i++) {
        temp[4 * t + i] = (k >> i) & 0x01;
      }
      let kk = 0n;
      for (let i = 23; i >= 0; i--) {
        kk = (kk << 1n) | (BigInt(temp[perm[i] - 1]) << 32n) | BigInt(temp[perm[i + 24] - 1]);
      }
      SPE[t][j] = toSixBit(kk);
    }
  }
}

initializeLegacyTables();

export function legacyHash(password: string, charset = 'utf8'): Buffer {
  const keyBytes = Buffer.from(password, charset as BufferEncoding).subarray(0, 8);
  let keyword = 0n;

  for (let i = 0; i < 8; i++) {
    keyword = (keyword << 8n) | BigInt(i < keyBytes.length ? 2 * keyBytes[i] : 0);
  }

  let resultBlock = desCipher(desSetKey(keyword));
  const cryptResult = Buffer.alloc(11);
  cryptResult[10] = ITOA64[Number((resultBlock << 2n) & 0x3fn)];
  resultBlock >>= 4n;
  for (let i = 9; i >= 0; i--) {
    cryptResult[i] = ITOA64[Number(resultBlock & 0x3fn)];
    resultBlock >>= 6n;
  }

  return cryptResult;
}

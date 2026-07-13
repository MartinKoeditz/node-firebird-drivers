import { describe, expect, it } from 'vitest';

import { charSets, createDataReader, createDataWriter, sqlTypes, type Descriptor } from '../lib/impl/fb-util';

describe('fb-util', () => {
  it('preserves raw bytes for SQL_VARYING fields with OCTETS charset', async () => {
    const descriptor: Descriptor = {
      type: sqlTypes.SQL_VARYING,
      subType: 0,
      charSet: charSets.octets,
      length: 4,
      scale: 0,
      offset: 2,
      nullOffset: 0,
    };

    const buffer = new Uint8Array(16);
    const writer = createDataWriter([descriptor]);
    const reader = createDataReader([descriptor]);

    const expected = Buffer.from([0x00, 0x01, 0x02, 0x03]);

    await writer({} as any, {} as any, buffer, [expected]);

    const result = await reader({ charSetForNONE: 'utf8' } as any, {} as any, buffer);

    expect(Buffer.isBuffer(result[0])).toBe(true);
    expect(result[0]).toEqual(expected);
  });
});

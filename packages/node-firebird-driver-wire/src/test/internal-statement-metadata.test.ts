import { statementInfo } from 'node-firebird-driver/dist/lib/impl';

import { parseStatementMetadata } from '../lib/statement-metadata';

function numericInfoItem(item: number, value: number): Buffer {
  const payload = Buffer.alloc(4);
  payload.writeInt32LE(value, 0);
  return Buffer.concat([Buffer.from([item, 4, 0]), payload]);
}

describe('statement metadata', () => {
  test('parses statement type and flags without described columns', () => {
    const metadata = parseStatementMetadata(
      Buffer.concat([
        numericInfoItem(statementInfo.sqlStmtType, statementInfo.sqlStmtSelect),
        numericInfoItem(statementInfo.sqlStmtFlags, 1),
        Buffer.from([1]),
      ]),
    );

    expect(metadata.type).toBe(statementInfo.sqlStmtSelect);
    expect(metadata.flags).toBe(1);
    expect(metadata.inputColumns).toEqual([]);
    expect(metadata.outputColumns).toEqual([]);
    expect(metadata.inputMessageLength).toBe(0);
    expect(metadata.outputMessageLength).toBe(0);
  });
});

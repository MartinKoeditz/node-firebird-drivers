import { createWireClient } from '../lib';
import * as fs from 'fs-extra-promise';

import {
  ensureDriverTestTmpDir,
  getDriverTestDatabaseUri,
  loadDriverTestConfig,
} from 'node-firebird-driver/src/test/test-config';

describe('node-firebird-driver-wire client', () => {
  const testConfig = loadDriverTestConfig();
  const client = createWireClient();
  let createdTmpDir = false;

  beforeAll(() => {
    createdTmpDir = ensureDriverTestTmpDir(testConfig).createdTmpDir;
  });

  afterAll(async () => {
    await client.dispose();

    if (createdTmpDir && testConfig.tmpDir) {
      fs.rmdirSync(testConfig.tmpDir);
    }
  });

  test('creates a database and executes statements through the public driver interface', async () => {
    const attachment = await client.createDatabase(getDriverTestDatabaseUri(testConfig, 'wire-client-smoke.fdb'), {
      username: testConfig.username,
      password: testConfig.password,
    });

    try {
      const transaction = await attachment.startTransaction();
      await attachment.execute(transaction, 'create table t1 (id integer, name varchar(20))');
      await transaction.commitRetaining();

      await attachment.execute(transaction, 'insert into t1 (id, name) values (?, ?)', [1, 'Alice']);
      await attachment.execute(transaction, 'insert into t1 (id, name) values (?, ?)', [2, 'Bob']);

      const singleton = await attachment.executeSingleton(transaction, 'select count(*) from t1');
      expect(singleton[0]).toBe(2);

      const resultSet = await attachment.executeQuery(transaction, 'select id, name from t1 order by id');
      const rows = await resultSet.fetchAsObject<{ ID: number; NAME: string }>();
      expect(rows).toStrictEqual([
        { ID: 1, NAME: 'Alice' },
        { ID: 2, NAME: 'Bob' },
      ]);
      await resultSet.close();

      await transaction.commit();
    } finally {
      await attachment.dropDatabase();
    }
  });
});

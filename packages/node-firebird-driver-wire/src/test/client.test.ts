import { createWireClient } from '../lib';

import { runCommonTests } from 'node-firebird-driver/dist/test/tests';

const client = createWireClient();

runCommonTests(client);

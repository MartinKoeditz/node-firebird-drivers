import { BlobStreamImpl } from './blob';
import { ClientImpl } from './client';
import { EventsImpl } from './events';
import { createDpb } from './fb-util';
import { StatementImpl } from './statement';
import { TransactionImpl } from './transaction';

import {
  Blob,
  ConnectOptions,
  CreateBlobOptions,
  CreateDatabaseOptions,
  PrepareOptions,
  TransactionOptions,
} from 'node-firebird-driver';
import { AbstractAttachment, cancelType } from 'node-firebird-driver/dist/lib/impl';

import { AttachmentHandle, WireProtocol } from './internal/wire-protocol';

interface ParsedDatabaseUri {
  readonly host: string;
  readonly port: number;
  readonly database: string;
}

export function parseDatabaseUri(uri: string): ParsedDatabaseUri {
  // Treat rooted Windows drive paths as hostless URIs.
  if (/^[A-Za-z]:(?:[\\/]|$)/.test(uri)) {
    return {
      host: 'localhost',
      port: 3050,
      database: uri,
    };
  }

  const match = /^(?:(.+?)(?:\/(\d+))?:)?(.+)$/.exec(uri);
  if (!match) {
    throw new Error(`Invalid Firebird database URI '${uri}'.`);
  }

  return {
    host: match[1] || 'localhost',
    port: match[2] ? parseInt(match[2], 10) : 3050,
    database: match[3],
  };
}

export class AttachmentImpl extends AbstractAttachment {
  override client: ClientImpl;
  protocol?: WireProtocol;
  attachmentHandle?: AttachmentHandle;

  private constructor(client: ClientImpl) {
    super(client);
  }

  static async connect(client: ClientImpl, uri: string, options?: ConnectOptions): Promise<AttachmentImpl> {
    return await AttachmentImpl.open(client, uri, options, false);
  }

  static async createDatabase(
    client: ClientImpl,
    uri: string,
    options?: CreateDatabaseOptions,
  ): Promise<AttachmentImpl> {
    return await AttachmentImpl.open(client, uri, options, true);
  }

  private static async open(
    client: ClientImpl,
    uri: string,
    options: ConnectOptions | CreateDatabaseOptions | undefined,
    createDatabase: boolean,
  ): Promise<AttachmentImpl> {
    const attachment = new AttachmentImpl(client);
    attachment.charSetForNONE = options?.charSetForNONE ?? 'utf8';

    const parsed = parseDatabaseUri(uri);
    const username = options?.username ?? process.env.ISC_USER ?? 'sysdba';
    const password = options?.password ?? process.env.ISC_PASSWORD ?? 'masterkey';

    attachment.protocol = new WireProtocol({
      host: parsed.host,
      port: parsed.port,
      username,
      password,
      timeoutMs: client.wireOptions.timeoutMs,
    });

    const dpb = createDpb(options);
    attachment.attachmentHandle = createDatabase
      ? await attachment.protocol.createDatabase(parsed.database, dpb)
      : await attachment.protocol.attach(parsed.database, dpb);

    return attachment;
  }

  protected async internalDisconnect(): Promise<void> {
    try {
      await this.protocol!.detach(this.attachmentHandle!);
    } finally {
      await this.protocol!.close();
      this.protocol = undefined;
      this.attachmentHandle = undefined;
    }
  }

  protected async internalDropDatabase(): Promise<void> {
    try {
      await this.protocol!.dropDatabase(this.attachmentHandle!);
    } finally {
      await this.protocol!.close();
      this.protocol = undefined;
      this.attachmentHandle = undefined;
    }
  }

  protected async internalEnableCancellation(enable: boolean): Promise<void> {
    await this.protocol!.cancelOperation(enable ? cancelType.enable : cancelType.disable);
  }

  protected async internalCancelOperation(forcibleAbort: boolean): Promise<void> {
    await this.protocol!.cancelOperation(forcibleAbort ? cancelType.abort : cancelType.raise);
  }

  protected async internalStartTransaction(options?: TransactionOptions): Promise<TransactionImpl> {
    return await TransactionImpl.start(this, options);
  }

  protected async internalCreateBlob(
    transaction: TransactionImpl,
    options?: CreateBlobOptions,
  ): Promise<BlobStreamImpl> {
    return await BlobStreamImpl.create(this, transaction, options);
  }

  protected async internalOpenBlob(transaction: TransactionImpl, blob: Blob): Promise<BlobStreamImpl> {
    return await BlobStreamImpl.open(this, transaction, blob);
  }

  protected async internalPrepare(
    transaction: TransactionImpl,
    sqlStmt: string,
    options?: PrepareOptions,
  ): Promise<StatementImpl> {
    return await StatementImpl.prepare(this, transaction, sqlStmt, options);
  }

  protected async internalQueueEvents(
    names: string[],
    callBack: (counters: [string, number][]) => Promise<void>,
  ): Promise<EventsImpl> {
    return await EventsImpl.queue(this, names, callBack);
  }
}

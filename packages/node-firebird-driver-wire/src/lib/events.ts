import { AttachmentImpl } from './attachment';

import { AbstractEvents } from 'node-firebird-driver/dist/lib/impl';

export class EventsImpl extends AbstractEvents {
  override attachment: AttachmentImpl;

  static async queue(
    _attachment: AttachmentImpl,
    _names: string[],
    _callBack: (counters: [string, number][]) => Promise<void>,
  ): Promise<EventsImpl> {
    throw new Error('Unimplemented method: queueEvents.');
  }

  protected async internalCancel(): Promise<void> {
    return await Promise.resolve();
  }
}

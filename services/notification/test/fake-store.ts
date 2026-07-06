import type {
  DueDelivery,
  RecordArgs,
  UpdateArgs,
  WebhookStore,
} from '../src/store';

/** In-memory WebhookStore for exercising delivery/retry logic without pg. */
export class FakeStore implements WebhookStore {
  records: RecordArgs[] = [];
  updates: Array<{ id: string; args: UpdateArgs }> = [];
  dueRows: DueDelivery[] = [];
  closed = false;

  async record(args: RecordArgs): Promise<string> {
    this.records.push(args);
    return `id-${this.records.length}`;
  }

  async due(limit: number): Promise<DueDelivery[]> {
    const batch = this.dueRows.slice(0, limit);
    this.dueRows = this.dueRows.slice(limit);
    return batch;
  }

  async update(id: string, args: UpdateArgs): Promise<void> {
    this.updates.push({ id, args });
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

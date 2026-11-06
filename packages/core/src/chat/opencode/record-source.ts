// One OpenCode session followed through its store (ADR 0025).

import { type StoreBudgets, StoreRecordSource } from '../store/record-source';
import { openCodeStore } from './probe';

export class OpenCodeRecordSource extends StoreRecordSource {
  constructor(session: string, budgets?: StoreBudgets) {
    super(openCodeStore, session, budgets);
  }
}

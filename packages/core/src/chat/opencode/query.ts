// OpenCode's names for the store query (ADR 0025): `chat/store` holds what every store shares.

export type {
  StorePollCursor as OpenCodePollCursor,
  StoreProblem as OpenCodeStoreProblem,
  StoreQuery as OpenCodeQuery,
  StoreQueryKind as OpenCodeQueryKind,
  StoreQueryResponse as OpenCodeQueryResponse,
  StoreRecords as OpenCodeRecords,
  StoreRowLine as OpenCodeRowLine,
} from '../store/query';

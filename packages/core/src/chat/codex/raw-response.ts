// `response_item` and `retained_context` payloads, flattened (Swift CodexRawResponse).

import { asObject, asString, type JsonObject } from '../model/reducer';
import {
  lossyObjects,
  lossyStrings,
  type RawOutputBody,
  type RawPart,
  readOutputBody,
  readParts,
} from './raw';

/** A `response_item` payload, flattened over the types the adapter reads. */
export interface RawResponse {
  type: string | null;
  id: string | null;
  role: string | null;
  name: string | null;
  namespace: string | null;
  arguments: string | null;
  input: string | null;
  callID: string | null;
  output: RawOutputBody | null;
  command: string[] | null;
  content: RawPart[] | null;
  turnID: string | null;
}

export function readResponse(o: JsonObject): RawResponse {
  return {
    type: asString(o.type),
    id: asString(o.id),
    role: asString(o.role),
    name: asString(o.name),
    namespace: asString(o.namespace),
    arguments: asString(o.arguments),
    input: asString(o.input),
    callID: asString(o.call_id),
    output: readOutputBody(o.output),
    command: lossyStrings(asObject(o.action)?.command),
    content: readParts(o.content),
    turnID: asString(asObject(o.internal_chat_message_metadata_passthrough)?.turn_id),
  };
}

export interface RawRetained {
  type: string | null;
  turnID: string | null;
  callID: string | null;
  questions: { question: string | null; answer: string | null }[] | null;
}

export function readRetained(o: JsonObject): RawRetained {
  return {
    type: asString(o.type),
    turnID: asString(o.turn_id),
    callID: asString(o.call_id),
    questions: lossyObjects(o.questions, (q) => ({
      question: asString(q.question),
      answer: asString(q.answer),
    })),
  };
}

/**
 * An error herdr returned inside a response envelope: the request arrived intact and the server
 * rejected it on its own terms. `code` is normalized to a string; the wire schema promises
 * `{"code","message"}` without pinning the code's JSON type (integers are seen in the wild).
 */
export class HerdrApiError extends Error {
  override readonly name = 'HerdrApiError';

  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }

  /**
   * herdr 0.9.4's macOS refusal of an `agent.start` whose launch line is longer than the
   * terminal's canonical input limit while the fresh shell is still in canonical mode. Only
   * "canonical mode" marks it: "could not determine canonical input capacity" is another failure.
   */
  get isCanonicalModeRefusal(): boolean {
    return this.code === 'agent_start_input_failed' && this.message.includes('canonical mode');
  }
}

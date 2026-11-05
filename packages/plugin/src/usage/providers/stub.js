/**
 * A collector for a provider whose limits are not readable yet: it reports nothing, so no card
 * appears on any Host. `needs` records why (see ADR 0025): "apiKey", "session" or "interactive".
 * Replace it with a real collector in its own file and keep the entry in `index.js`.
 */
export const stubCollector = (program, needs) => ({ program, needs, cadenceMs: 5 * 60_000, collect: async () => null });

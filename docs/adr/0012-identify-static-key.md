# 0012. `/identify/` reimplements the Lucid3 key as static client-side data

**Status:** Accepted

## Context

The original site offered species identification through an external **Lucid3** key applet — a
Java/server-dependent tool that cannot run on a static site ([0001](0001-static-no-server.md)) and
would be a heavy third-party embed. But the key's *value* is its data: a matrix binding species to
morphological character-states. That data was exportable. The question was whether to embed the
applet, drop identification, or rebuild the interaction from the exported data.

## Decision

Reimplement the key as **static client-side data** on `/identify/`. The core is a **237
character-state × 1,228-species bitset** (`data/key-matrix.json`, base64 `Uint8Array` per state).
The UI narrows species by character-state selection with **OR within a question, AND across
questions**, and **"0 = unscored, never absent"** — a raw `0`/blank never eliminates a species
(TDD-locked semantics). Character→image bindings come **authoritatively from the original Lucid3
`key.data`**, not a fuzzy filename matcher. The external applet is **not** embedded (v4.0).

## Consequences

- Identification works entirely client-side against a compact bitset — no server, no applet.
- **Authoritative source over heuristic**: reading the real `key.data` binds **180/237** characters
  to images versus **77/237** from the fuzzy filename matcher. When an authoritative export exists,
  parse it rather than guessing — a general principle worth repeating (compare
  [0014](0014-districts-offline-writeback.md)'s crosswalk over name-matching). Size & Seasonality
  genuinely have no source art.
- The "0 = unscored" rule is subtle and easy to break, so it is locked by tests: absence of a score
  must be treated as "unknown," never as "does not have this trait."
- Withheld taxa are filtered out of Identify results through the shared `shown` predicate
  ([0015](0015-data-driven-gating.md)).

## Alternatives considered

- **Embed the external Lucid applet** — rejected: server/Java dependency, heavy third-party embed,
  incompatible with a static site.
- **Fuzzy filename matcher for character images** — rejected: 77/237 coverage and unreliable;
  the authoritative `key.data` more than doubles it.

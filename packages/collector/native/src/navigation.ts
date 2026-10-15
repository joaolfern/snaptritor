/**
 * Marvel Snap navigation constants (T009), derived from the real, running game — not inferred
 * from screenshots alone. Verified live: Shop opened on the first click, then explicitly
 * navigated away (to the Offers tab) and back through every step below, confirming each click
 * target independently rather than trusting one lucky run that happened to land on the target
 * screen because the game remembered its last-viewed tab.
 *
 * All fractions are relative to the game window's own client rect (via {@link clickProportional}
 * / {@link capture}), not absolute screen coordinates — consistent with plan.md's design so this
 * keeps working if the window moves or resizes. Verified at 1920x1080 fullscreen/borderless; if
 * the collector ever needs to support a different in-game resolution, re-verify these against a
 * real capture rather than assuming the fractions transfer.
 */

/**
 * The game's window title is the literal string `"SNAP"` — nothing more. Match it with an EXACT
 * comparison, not {@link findWindow}'s default substring search: this repository's own name,
 * "snaptritor", contains "snap" as a substring, so a loose match can accidentally match a VS Code
 * or terminal window whose title mentions this repo instead of the game. Confirmed the hard way
 * during T009 — `getWindows()` listed both "SNAP" and a VS Code window titled
 * "... - snaptritor [WSL: Ubuntu] ..." for a lowercase "snap" search.
 */
export const GAME_WINDOW_TITLE = "SNAP";

export interface NavigationStep {
  /** What this step does, for logging. */
  description: string;
  xFraction: number;
  yFraction: number;
}

/**
 * Main menu → Shop → Cards tab → Daily Cards sub-tab. Each step was clicked and verified with its
 * own screenshot; the sequence is written out in full (rather than relying on the Shop button
 * alone, which happened to land here directly in testing) because the game remembers the
 * last-viewed shop tab within a session — that memory cannot be relied on after a fresh launch,
 * which is exactly how the real collector will encounter it (RF02's "the game is launched").
 */
export const NAVIGATE_TO_DAILY_CARDS: NavigationStep[] = [
  { description: "Click Shop (top right of main menu)", xFraction: 0.711, yFraction: 0.04 },
  { description: "Click the Cards tab (top right of the Shop panel)", xFraction: 0.606, yFraction: 0.086 },
  { description: "Click the Daily Cards sub-tab (3rd of 4 icons under Cards)", xFraction: 0.555, yFraction: 0.136 },
];

/**
 * The region of the Shop panel that holds the Daily Cards rotation — what RF03 actually
 * captures. Covers the "Daily Cards" heading, the rotation countdown, and all five card tiles
 * (the three daily-rotating slots plus the Ultimate/Spotlight variant slots below them).
 */
export const DAILY_CARDS_REGION = {
  leftFraction: 0.375,
  topFraction: 0.2,
  widthFraction: 0.255,
  heightFraction: 0.75,
};

/**
 * T010's "confirm the screen finished loading" step (plan.md) was meant to poll a landmark region
 * against a known loading-state capture. In practice, no loading spinner was ever observed here —
 * the shop opened instantly on every one of T009's runs — so there is no "loading vs. loaded" pair
 * to diff. Until one is actually seen (a slow network, a cold cache), T010 should instead poll
 * {@link DAILY_CARDS_REGION} for *stability*: capture twice, ~300ms apart, and proceed once two
 * consecutive captures hash within {@link isSameImage}'s threshold of each other, with a timeout
 * that treats "never stabilizes" as a failed run (NF06) rather than capturing something indeterminate.
 */


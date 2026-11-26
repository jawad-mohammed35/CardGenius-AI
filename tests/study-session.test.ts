import assert from "node:assert/strict";
import { test } from "node:test";
import { createStudySession, rateCard, rateStudyCard, reviewMissedCards, shuffleStudySession } from "../lib/study-session.ts";

test("finishes after every card in the current session has been rated", () => {
  const initial = createStudySession(2);
  const oneRated = rateCard(initial, "known");
  assert.equal(oneRated.complete, false);
  assert.deepEqual(initial.ratings, {});

  const completed = rateCard({ ...oneRated, position: 1 }, "review");
  assert.deepEqual(completed.ratings, { 0: "known", 1: "review" });
  assert.equal(completed.complete, true);
  assert.equal(rateCard(completed, "review").complete, false);
});

test("reviewing missed cards preserves known ratings across repeat attempts", () => {
  const initial = createStudySession(3);
  const history = { ...initial, ratings: { 0: "known", 1: "review", 2: "known" } as const, complete: true };
  const review = reviewMissedCards(history);
  assert.deepEqual(review.order, [1]);
  assert.deepEqual(review.ratings, { 0: "known", 2: "known" });
  assert.equal(review.complete, false);
  const completed = rateCard(review, "known");
  assert.equal(completed.complete, true);
  assert.deepEqual(completed.ratings, { 0: "known", 1: "known", 2: "known" });
});

test("shuffle changes the order and returns to the first card while retaining ratings", () => {
  const initial = { ...createStudySession(3), position: 2, ratings: { 0: "known" } as const };
  const shuffled = shuffleStudySession(initial, () => 0);
  assert.deepEqual(shuffled.order, [1, 2, 0]);
  assert.equal(shuffled.position, 0);
  assert.deepEqual(shuffled.ratings, { 0: "known" });
  assert.deepEqual(initial.order, [0, 1, 2]);
});

test("auto-advance moves after a rating, returns to skipped cards, and finishes once all cards are rated", () => {
  const first = rateStudyCard(createStudySession(3), "known", true);
  assert.equal(first.position, 1);
  const wrapped = rateStudyCard({ ...first, position: 2 }, "review", true);
  assert.equal(wrapped.position, 1);
  const completed = rateStudyCard(wrapped, "known", true);
  assert.equal(completed.complete, true);
  assert.equal(completed.position, 1);
  assert.deepEqual(completed.ratings, { 0: "known", 1: "known", 2: "review" });
});

test("manual study stays on the current card when setting or clearing a rating", () => {
  const rated = rateStudyCard(createStudySession(2), "review", false);
  assert.equal(rated.position, 0);
  assert.deepEqual(rated.ratings, { 0: "review" });
  assert.deepEqual(rateStudyCard(rated, "review", true), createStudySession(2));
});

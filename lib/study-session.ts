export type CardRating = "known" | "review";

export type StudySession = {
  order: number[];
  position: number;
  ratings: Partial<Record<number, CardRating>>;
  complete: boolean;
};

export function createStudySession(cardCount: number): StudySession {
  return {
    order: Array.from({ length: cardCount }, (_, index) => index),
    position: 0,
    ratings: {},
    complete: false,
  };
}

export function rateCard(session: StudySession, rating: CardRating): StudySession {
  const card = session.order[session.position];
  const ratings = { ...session.ratings };
  if (ratings[card] === rating) delete ratings[card];
  else ratings[card] = rating;
  return { ...session, ratings, complete: session.order.every((index) => ratings[index] !== undefined) };
}

export function shuffleStudySession(session: StudySession, random = Math.random): StudySession {
  const order = [...session.order];
  for (let index = order.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  return { ...session, order, position: 0, complete: false };
}

export function reviewMissedCards(session: StudySession): StudySession {
  const ratings = { ...session.ratings };
  const order = Object.entries(ratings).filter(([, rating]) => rating === "review").map(([index]) => Number(index));
  if (!order.length) return session;
  for (const index of order) delete ratings[index];
  return { order, position: 0, ratings, complete: false };
}

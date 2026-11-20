import type { User } from "./types";

type List = "users" | "memberships";
type Search = { query: string; page: number };
const bySession = new WeakMap<User, Partial<Record<List, Search>>>();

export function readListSearch(user: User | null, list: List) {
  return user ? bySession.get(user)?.[list] : undefined;
}

export function rememberListSearch(user: User, list: List, query: string, page: number) {
  const state = bySession.get(user) ?? {};
  if (query) state[list] = { query, page };
  else delete state[list];
  bySession.set(user, state);
}

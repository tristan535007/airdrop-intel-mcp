import { AsyncLocalStorage } from "node:async_hooks";

export const requestContext = new AsyncLocalStorage<{ userId: string; isPro: boolean }>();

export function getCurrentUserId(): string {
  return requestContext.getStore()?.userId ?? "local-dev-user";
}

export function getCurrentUserIsPro(): boolean {
  return requestContext.getStore()?.isPro ?? false;
}

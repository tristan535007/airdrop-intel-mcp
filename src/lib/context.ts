import { AsyncLocalStorage } from "node:async_hooks";

export const requestContext = new AsyncLocalStorage<{ userId: string }>();

export function getCurrentUserId(): string {
  return requestContext.getStore()?.userId ?? "local-dev-user";
}

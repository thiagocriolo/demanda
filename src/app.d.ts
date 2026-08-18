import type { RequestAuthorizationContext } from "$lib/server/authorization/workspace-context";

declare global {
  namespace App {
    interface Locals {
      auth: RequestAuthorizationContext | null;
    }
  }
}

export {};

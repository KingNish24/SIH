/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    user?: import('./lib/types').User | null;
    session?: import('./lib/types').Session | null;
    runtime?: {
      env?: {
        DB?: any;
        [key: string]: any;
      };
    };
  }
}

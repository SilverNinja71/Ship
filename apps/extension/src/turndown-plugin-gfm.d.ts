// turndown-plugin-gfm ships no types. Ship uses only `gfm` (tables, strikethrough, task lists).
declare module "turndown-plugin-gfm" {
  import type TurndownService from "turndown";
  export const gfm: TurndownService.Plugin;
}

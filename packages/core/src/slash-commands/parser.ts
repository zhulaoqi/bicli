import type { SlashCommand } from "./types.js";

export function parseSlashCommand(input: string): SlashCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;
  const parts = trimmed.slice(1).split(/\s+/);
  return {
    name: parts[0],
    args: parts.slice(1),
    raw: trimmed,
  };
}

export function isSlashCommand(input: string): boolean {
  return input.trim().startsWith("/");
}

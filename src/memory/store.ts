import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Memory is two plain markdown files the agent is allowed to edit.
 * Plain text on purpose: judges can read it, git history shows it growing.
 *   judgment.md  rules about the user ("CI failures from my repos = act now")
 *   tools.md     rules about the source app/API ("batch Gmail threads by 25")
 */
export type MemoryKind = "judgment" | "tools";

/** MEMORY_DIR=memory/sample keeps sample-set runs from overwriting the real-inbox memory */
export const MEMORY_DIR = path.resolve(process.cwd(), process.env.MEMORY_DIR ?? "memory");

const HEADER: Record<MemoryKind, string> = {
  judgment: "# Judgment memory\n\nRules the agent has learned about how this user handles items. One rule per line, prefixed with `- `.\n\n",
  tools: "# Tool memory\n\nRules the agent has learned about using the source apps and their APIs. One rule per line, prefixed with `- `.\n\n",
};

export async function readMemory(kind: MemoryKind, source?: string): Promise<string> {
  const file = memoryPath(kind, source);
  if (!existsSync(file)) return HEADER[kind];
  return readFile(file, "utf8");
}

export async function writeMemory(kind: MemoryKind, content: string, source?: string): Promise<void> {
  await mkdir(MEMORY_DIR, { recursive: true });
  await writeFile(memoryPath(kind, source), content, "utf8");
}

export async function appendRules(kind: MemoryKind, rules: string[], source?: string): Promise<void> {
  if (rules.length === 0) return;
  const current = await readMemory(kind, source);
  const existing = new Set(listRules(current));
  const fresh = rules.map((r) => r.trim()).filter((r) => r && !existing.has(r));
  if (fresh.length === 0) return;
  const body = current.endsWith("\n") ? current : current + "\n";
  await writeMemory(kind, body + fresh.map((r) => `- ${r}`).join("\n") + "\n", source);
}

export function listRules(content: string): string[] {
  return content
    .split("\n")
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2).trim())
    .filter(Boolean);
}

export function memoryPath(kind: MemoryKind, source?: string): string {
  const name = source ? `${kind}.${source}.md` : `${kind}.md`;
  return path.join(MEMORY_DIR, name);
}

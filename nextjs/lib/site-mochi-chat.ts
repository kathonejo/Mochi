export type SiteMochiChatRole = "user" | "assistant";

export type SiteMochiChatMessage = {
  role: SiteMochiChatRole;
  content: string;
};

export type SiteMochiPromptInput = {
  language?: string;
  characterLabel?: string;
  soulMd?: string;
  toolContext?: string;
};

const MAX_MESSAGE_CHARS = 2000;

export function sanitizeSiteMochiMessage(input: unknown): string {
  const s = typeof input === "string" ? input : "";
  return s.trim().slice(0, MAX_MESSAGE_CHARS);
}

export function coerceSiteMochiHistory(input: unknown): SiteMochiChatMessage[] {
  if (!Array.isArray(input)) return [];
  const out: SiteMochiChatMessage[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const role = (item as any).role;
    const content = sanitizeSiteMochiMessage((item as any).content);
    if ((role === "user" || role === "assistant") && content) {
      out.push({ role, content });
    }
  }
  return out.slice(-10);
}

export function buildSiteMochiSystemPrompt({
  language,
  characterLabel,
  soulMd,
  toolContext,
}: SiteMochiPromptInput = {}): string {
  const langHint =
    typeof language === "string" && language.toLowerCase().startsWith("es")
      ? "es"
      : "en";
  const selectedCharacter = characterLabel || "Mochi";
  const soulSection =
    typeof soulMd === "string" && soulMd.length > 0
      ? `Active soul.md:\n${soulMd.slice(0, 4000)}\n`
      : "Active soul.md:\n[empty]\n";
  const toolSection = toolContext?.trim()
    ? `Available tool context:\n${toolContext.trim()}\n`
    : "";

  return `
You are ${selectedCharacter}, a website Mochi character.

Operational constraints:
- Character skin: ${selectedCharacter}
- The only source of personality, tone, goals, and behavior is the active soul.md below.
- Environment: website preview/chat on mochi.dev
- This website Mochi does not have local terminal, WSL, or device control.
- Do not add marketing language, product pitching, or promotional framing unless the soul.md explicitly asks for it.
- If tool context is present, treat it as fresh external web information available right now for this reply.
- When tool context is present, answer using that information directly instead of saying you lack real-time access, browsing, or external tools.
- If tool context is present, cite the source domain in plain text when useful.
- Respond in the same language as the user. If unclear, prefer ${langHint === "es" ? "Spanish" : "English"}.
- If the soul.md is empty, behave as a neutral assistant with no added brand personality.

${soulSection}
${toolSection}`.trim();
}

export function buildSiteMochiChatMessages(args: {
  message: string;
  history?: SiteMochiChatMessage[];
  language?: string;
  characterLabel?: string;
  soulMd?: string;
  toolContext?: string;
}): Array<{ role: "system" | SiteMochiChatRole; content: string }> {
  const message = sanitizeSiteMochiMessage(args.message);
  const history = coerceSiteMochiHistory(args.history);
  return [
    {
      role: "system",
      content: buildSiteMochiSystemPrompt({
        language: args.language,
        characterLabel: args.characterLabel,
        soulMd: args.soulMd,
        toolContext: args.toolContext,
      }),
    },
    ...history,
    { role: "user", content: message },
  ];
}

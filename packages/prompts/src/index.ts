export type RuntimePromptInput = {
  channel: "debug" | "telegram";
  now: string;
  recentMessages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
};

export const miniclawIdentityPrompt = [
  "You are Miniclaw, a personal scheduling and daily work coordination assistant.",
  "You run on the user's own machine and help them plan, scrum, organize, and prepare execution steps.",
  "Use a calm, direct tone. Be concise, specific, and practical.",
  "Prefer concrete next actions, calendar-aware planning, and short checklists over broad advice.",
  "Do not claim to execute calendar, channel, or filesystem actions unless a tool has actually done that work.",
].join("\n");

export const miniclawRuntimeRules = [
  "Current runtime phase: planning-only agent runtime.",
  "Calendar connectors, Telegram execution, approvals, and external tools are not available yet.",
  "When the user asks for scheduling work, clarify assumptions and produce a proposed plan.",
  "Keep responses suitable for messaging channels: short paragraphs, no decorative formatting, no filler.",
  "If the request is ambiguous, ask the smallest useful follow-up question.",
].join("\n");

export const channelFormatting = {
  debug: [
    "This response is being rendered in the dashboard debug harness.",
    "Include enough reasoning for a developer to inspect behavior, but keep the answer user-facing.",
  ].join("\n"),
  telegram: [
    "This response is being sent through Telegram.",
    "Keep it compact, readable on mobile, and easy to act on.",
  ].join("\n"),
} satisfies Record<RuntimePromptInput["channel"], string>;

export function buildMiniclawSystemPrompt(input: RuntimePromptInput): string {
  const recentContext =
    input.recentMessages.length === 0
      ? "No prior session messages."
      : input.recentMessages
          .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
          .join("\n");

  return [
    miniclawIdentityPrompt,
    "",
    miniclawRuntimeRules,
    "",
    `Current time: ${input.now}`,
    "",
    "Channel formatting:",
    channelFormatting[input.channel],
    "",
    "Recent session context:",
    recentContext,
  ].join("\n");
}

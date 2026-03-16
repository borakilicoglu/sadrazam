export const SUPPORTED_AI_PROVIDERS = ["openai", "anthropic", "gemini"] as const;

export type AiProvider = (typeof SUPPORTED_AI_PROVIDERS)[number];

export interface AiConfig {
  enabled: boolean;
  provider: AiProvider;
  token: string;
  model?: string;
}

export interface AiOptionsInput {
  ai?: boolean;
  provider?: string;
  model?: string;
}

export function resolveAiConfig(options: AiOptionsInput): AiConfig | null {
  if (!options.ai) {
    return null;
  }

  const provider = (options.provider ?? process.env.AI_PROVIDER ?? "openai").trim();
  const token = (process.env.AI_TOKEN ?? "").trim();
  const model = (options.model ?? process.env.AI_MODEL ?? "").trim();

  if (!isAiProvider(provider)) {
    throw new Error(
      `Unsupported AI provider "${provider}". Supported providers: ${SUPPORTED_AI_PROVIDERS.join(", ")}`,
    );
  }

  if (!token) {
    throw new Error(
      "AI mode requires AI_TOKEN. Set AI_PROVIDER/AI_TOKEN in your environment or use --provider.",
    );
  }

  return {
    enabled: true,
    provider,
    token,
    ...(model ? { model } : {}),
  };
}

function isAiProvider(value: string): value is AiProvider {
  return SUPPORTED_AI_PROVIDERS.includes(value as AiProvider);
}

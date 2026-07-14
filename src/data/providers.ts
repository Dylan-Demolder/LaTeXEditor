export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiDocs: string;
  models: { id: string; name: string }[];
  requiresApiKey: boolean;
  headers?: Record<string, string>;
}

export const PROVIDERS: ProviderConfig[] = [
  {
    id: "openai",
    name: "OpenAI (ChatGPT)",
    baseUrl: "https://api.openai.com/v1/chat/completions",
    apiDocs: "https://platform.openai.com/api-keys",
    models: [
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini" },
      { id: "gpt-4.5-preview", name: "GPT-4.5 Preview" },
      { id: "o4-mini", name: "O4 Mini" },
      { id: "o3", name: "O3" },
    ],
    requiresApiKey: true,
  },
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    baseUrl: "https://api.anthropic.com/v1/messages",
    apiDocs: "https://console.anthropic.com/keys",
    models: [
      { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
      { id: "claude-opus-4-20250514", name: "Claude Opus 4" },
      { id: "claude-haiku-3.5-sonnet-20250514", name: "Claude Haiku 3.5" },
    ],
    requiresApiKey: true,
    headers: {
      "anthropic-version": "2023-06-01",
      "x-api-key": "$$API_KEY$$",
    },
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1/chat/completions",
    apiDocs: "https://platform.deepseek.com/api_keys",
    models: [
      { id: "deepseek-chat", name: "DeepSeek V3" },
      { id: "deepseek-reasoner", name: "DeepSeek R1" },
    ],
    requiresApiKey: true,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    apiDocs: "https://openrouter.ai/keys",
    models: [
      { id: "openai/gpt-4o", name: "GPT-4o" },
      { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4" },
      { id: "deepseek/deepseek-chat", name: "DeepSeek V3" },
      { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      { id: "x-ai/grok-4", name: "Grok 4" },
      { id: "meta-llama/llama-4-maverick", name: "Llama 4 Maverick" },
    ],
    requiresApiKey: true,
  },
  {
    id: "grok",
    name: "Grok (xAI)",
    baseUrl: "https://api.x.ai/v1/chat/completions",
    apiDocs: "https://console.x.ai/",
    models: [
      { id: "grok-4", name: "Grok 4" },
      { id: "grok-4-mini", name: "Grok 4 Mini" },
    ],
    requiresApiKey: true,
  },
  {
    id: "opencode-go",
    name: "OpenCode Go",
    baseUrl: "https://opencode.ai/zen/go/v1/chat/completions",
    apiDocs: "https://opencode.ai/auth",
    models: [
      { id: "glm-5.2", name: "GLM-5.2" },
      { id: "kimi-k2.7-code", name: "Kimi K2.7 Code" },
      { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" },
      { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" },
      { id: "mimo-v2.5", name: "MiMo V2.5" },
      { id: "qwen3.7-max", name: "Qwen 3.7 Max" },
      { id: "qwen3.7-plus", name: "Qwen 3.7 Plus" },
      { id: "minimax-m3", name: "MiniMax M3" },
    ],
    requiresApiKey: true,
  },
  {
    id: "ollama",
    name: "Ollama (Local)",
    baseUrl: "http://localhost:11434/v1/chat/completions",
    apiDocs: "https://ollama.com",
    models: [
      { id: "llama3.3", name: "Llama 3.3" },
      { id: "mistral", name: "Mistral" },
      { id: "codellama", name: "Code Llama" },
      { id: "deepseek-r1", name: "DeepSeek R1" },
    ],
    requiresApiKey: false,
  },
];

export interface AppSettings {
  activeProvider: string;
  activeModel: string;
  apiKeys: Record<string, string>;
  temperature: number;
  maxTokens: number;
  theme: "dark" | "light";
  autoCompile: boolean;
  mcpPort: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  activeProvider: "openai",
  activeModel: "gpt-4o-mini",
  apiKeys: {},
  temperature: 0.7,
  maxTokens: 4096,
  theme: "dark",
  autoCompile: false,
  mcpPort: 9876,
};

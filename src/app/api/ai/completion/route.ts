import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamText } from "ai";

export async function POST(req: Request) {
  try {
    const { prompt, provider, apiKey } = await req.json();

    if (!apiKey) {
      return new Response("API key required", { status: 401 });
    }

    let model;
    if (provider === "openai") {
      const openai = createOpenAI({ apiKey });
      model = openai("gpt-4o");
    } else if (provider === "anthropic") {
      const anthropic = createAnthropic({ apiKey });
      model = anthropic("claude-3-7-sonnet-20250219");
    } else if (provider === "google") {
      const google = createGoogleGenerativeAI({ apiKey });
      model = google("gemini-2.5-flash");
    } else if (provider === "openrouter") {
      const openrouter = createOpenAI({
        apiKey,
        baseURL: "https://openrouter.ai/api/v1",
      });
      // We default to a strong openrouter model
      model = openrouter("anthropic/claude-3.5-sonnet");
    } else {
      return new Response("Invalid provider", { status: 400 });
    }

    const result = streamText({
      model,
      prompt,
    });

    // Use pure text stream for simple client parsing
    return result.toTextStreamResponse();
  } catch (error: unknown) {
    console.error("AI Completion Error:", error);
    return new Response(error instanceof Error ? error.message : "Internal Server Error", { status: 500 });
  }
}

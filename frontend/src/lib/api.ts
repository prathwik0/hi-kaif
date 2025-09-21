export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | any;
  tool_calls?: Array<{
    id: string;
    type: string;
    function?: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
}

// Define types for streamed events
interface StreamText {
  type: "chunk";
  payload: string;
}
interface StreamToolCall {
  type: "tool_call";
  payload: {
    id: string;
    type: string;
    function?: { name: string; arguments: string };
  };
}
interface StreamToolResult {
  type: "tool_result";
  payload: { tool_call_id: string; content: any; error?: boolean };
}
export type StreamEvent = StreamText | StreamToolCall | StreamToolResult;

export class LLMClient {
  private baseUrl: string;
  private defaultModelName: string;

  constructor(baseUrl: string, defaultModelName: string) {
    this.baseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    this.defaultModelName = defaultModelName;
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch (error) {
      console.error("Health check failed:", error);
      return false;
    }
  }


  async streamChatResponse(
    messages: ChatMessage[],
    onEvent: (event: StreamEvent) => void,
    onError: (error: unknown) => void,
    onComplete: () => void,
    modelName?: string
  ): Promise<void> {
    try {
      //console.log("streamChatResponse", messages);
      const response = await fetch(`${this.baseUrl}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          messages: messages,
          model: modelName || this.defaultModelName,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.detail || `Request failed: ${response.status}`
        );
      }

      if (!response.body) {
        throw new Error("Response body is null");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          onComplete();
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const jsonData = JSON.parse(line.slice(6));
              if (jsonData.v) {
                onEvent({ type: "chunk", payload: jsonData.v });
              } else if (jsonData.tc) {
                onEvent({ type: "tool_call", payload: jsonData.tc });
              } else if (jsonData.tr) {
                onEvent({ type: "tool_result", payload: jsonData.tr });
              }
              // } else if (jsonData.type === 'error') {
              //   onError(new Error(jsonData.content || "Unknown error from backend"));
              // } else if (jsonData.type === 'full_response') {
              //   console.log("Full response received:", jsonData.full_response);
              // }
            } catch (e) {
              console.error("Error parsing JSON from stream:", e);
            }
          }
        }
      }
    } catch (error) {
      onError(error);
    }
  }

  async transcribeAudio(audioBlob: Blob, language: string): Promise<string> {
    // Create a File object with the correct MIME type
    const audioFile = new File([audioBlob], "recording.webm", {
      type: "audio/webm",
    });

    const formData = new FormData();
    formData.append("audio", audioFile);
    formData.append("language", language);

    const response = await fetch(`${this.baseUrl}/transcribe`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      try {
        const error = await response.json();
        throw new Error(
          error.detail || error.error || "Failed to transcribe audio"
        );
      } catch (parseError) {
        // Handle cases where the error response is not JSON
        throw new Error(`Failed to transcribe audio: ${response.statusText}`);
      }
    }

    const data = await response.json();
    return data.text;
  }
}

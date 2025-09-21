import { type ChatMessage } from "./api";

// Message types for the UI
export interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "function" | "tool" | "data";
  content: string;
  createdAt?: Date;
  parts: MessageUIPart[];
  annotations?: Array<JSONValue>;
  experimental_attachments?: Attachment[];
}

// Attachment type
export interface Attachment {
  name?: string;
  contentType?: string;
  url: string;
}

// Source types
export interface Source {
  sourceType: "url";
  id: string;
  url: string;
  title?: string;
}

export interface SourceUIPart {
  type: "source";
  source: Source;
}

export interface StepStartUIPart {
  type: "step-start";
}

export interface FileUIPart {
  type: "file";
}

// JSON value type
export type JSONValue =
  | null
  | string
  | number
  | boolean
  | {
      [value: string]: JSONValue;
    }
  | Array<JSONValue>;

// Message part types
export interface TextUIPart {
  type: "text";
  text: string;
}

export interface ReasoningUIPart {
  type: "reasoning";
  reasoning: string;
}

export interface ToolInvocationUIPart {
  type: "tool-invocation";
  toolInvocation: ToolInvocation;
}

export type MessageUIPart =
  | TextUIPart
  | ToolInvocationUIPart
  | ReasoningUIPart
  | SourceUIPart
  | StepStartUIPart
  | FileUIPart;

// Tool call types
export interface PartialToolCall {
  state: "partial-call";
  toolCallId: string;
  toolName: string;
  args: any;
}

export interface ToolCall {
  state: "call";
  toolCallId: string;
  toolName: string;
  args: any;
}

export interface ToolResult {
  state: "result";
  toolCallId: string;
  toolName: string;
  args: any;
  result: {
    __cancelled?: boolean;
    content?: string;
    [key: string]: any;
  };
}

export type ToolInvocation = PartialToolCall | ToolCall | ToolResult;

// Generate a unique ID for each message
const generateMessageId = () =>
  `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

/**
 * Converts OpenAI-style chat messages into our UI-friendly Message format
 * that properly handles tool calls and their results.
 *
 * @param messages Array of OpenAI format messages (can be a single message wrapped in an array)
 * @param options Optional parameters like custom ID or creation date for a single message
 * @returns Array of UI-friendly Message objects
 */
export function convertOpenAIMessages(
  messages: ChatMessage[] | ChatMessage,
  options?: {
    id?: string;
    createdAt?: Date;
    assistantMessageIdToReuse?: string | null;
  }
): Message[] {
  const messageArray = Array.isArray(messages) ? messages : [messages];
  const formattedMessages: Message[] = [];
  const assistantToolCallMap = new Map<string, Message>();
  let assistantIdHasBeenReusedThisCall = false;

  messageArray.forEach((msg, index) => {
    if (msg.role === "tool") {
      return;
    }

    let messageId: string;
    let createdAtDate: Date;

    if (
      msg.role === "assistant" &&
      options?.assistantMessageIdToReuse &&
      !assistantIdHasBeenReusedThisCall
    ) {
      messageId = options.assistantMessageIdToReuse;
      createdAtDate = (msg as any).timestamp ? new Date((msg as any).timestamp) : new Date();
      assistantIdHasBeenReusedThisCall = true;
    } else if (!Array.isArray(messages) && options?.id && index === 0) {
      messageId = options.id;
      createdAtDate = options.createdAt || new Date();
    } else {
      messageId = generateMessageId();
      createdAtDate = (msg as any).timestamp ? new Date((msg as any).timestamp) : new Date();
    }

    const newMessage: Message = {
      id: messageId,
      role: msg.role as Message["role"],
      content: msg.content || "",
      createdAt: createdAtDate,
      parts: [],
    };

    if (
      msg.role === "assistant" &&
      msg.tool_calls &&
      msg.tool_calls.length > 0
    ) {
      const toolInvocationParts: ToolInvocationUIPart[] = msg.tool_calls.map(
        (toolCall: any) => ({
          type: "tool-invocation",
          toolInvocation: {
            state: "call",
            toolCallId: toolCall.id,
            toolName: toolCall.function?.name || "unknown",
            args: toolCall.function?.arguments
              ? JSON.parse(toolCall.function.arguments)
              : {},
          },
        })
      );

      if (msg.content) {
        newMessage.parts.push({ type: "text", text: msg.content });
      }
      newMessage.parts.push(...toolInvocationParts);
      assistantToolCallMap.set(newMessage.id, newMessage);
    } else if (msg.content) {
      newMessage.parts.push({ type: "text", text: msg.content });
    } else if (
      msg.role === "assistant" &&
      !msg.content &&
      (!msg.tool_calls || msg.tool_calls.length === 0)
    ) {
      newMessage.parts.push({ type: "text", text: "" });
    }

    formattedMessages.push(newMessage);
  });

  messageArray.forEach((msg) => {
    if (msg.role === "tool" && msg.tool_call_id) {
      let foundAssistantMessage: Message | undefined;
      for (const assistantMsg of assistantToolCallMap.values()) {
        const matchingToolCallPart = assistantMsg.parts?.find(
          (part): part is ToolInvocationUIPart =>
            part.type === "tool-invocation" &&
            part.toolInvocation.toolCallId === msg.tool_call_id
        );
        if (matchingToolCallPart) {
          foundAssistantMessage = assistantMsg;
          break;
        }
      }

      if (foundAssistantMessage && foundAssistantMessage.parts) {
        foundAssistantMessage.parts = foundAssistantMessage.parts.map(
          (part) => {
            if (
              part.type === "tool-invocation" &&
              part.toolInvocation.toolCallId === msg.tool_call_id
            ) {
              let resultContent = "";
              if (typeof msg.content === "string") {
                resultContent = msg.content;
              } else if (Array.isArray(msg.content) && msg.content.length > 0) {
                const textContentItem = msg.content.find(
                  (item: any) => item.type === "text"
                );
                if (
                  textContentItem &&
                  typeof textContentItem.text === "string"
                ) {
                  resultContent = textContentItem.text;
                } else {
                  resultContent = JSON.stringify(msg.content);
                }
              } else {
                resultContent = JSON.stringify(msg.content);
              }

              let parsedResult: any = { content: resultContent };
              try {
                if (
                  typeof resultContent === "string" &&
                  (resultContent.startsWith("{") ||
                    resultContent.startsWith("["))
                ) {
                  parsedResult = JSON.parse(resultContent);
                }
              } catch (e) {
                // parsedResult already defaults to { content: resultContent }
              }
              if (typeof parsedResult !== "object" || parsedResult === null) {
                parsedResult = { content: resultContent };
              }

              return {
                type: "tool-invocation" as const,
                toolInvocation: {
                  ...part.toolInvocation,
                  state: "result" as const,
                  result: parsedResult,
                },
              };
            }
            return part;
          }
        );
      }
    }
  });

  return formattedMessages;
}

import { useState, useCallback, useRef } from "react";
import {
  type LLMClient,
  type StreamEvent,
  type ChatMessage,
} from "@/lib/api";
import { convertOpenAIMessages, type Message } from "@/lib/message-utils";

type ChatStatus = "ready" | "loading" | "submitted" | "streaming" | "error";

// Helper to generate unique IDs
const generateUniqueId = () =>
  `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;


export function useChat({
  llmClient,
  modelName,
}: {
  llmClient: LLMClient;
  modelName: string;
}) {
  // Store OpenAI messages format to pass full history to backend
  const [openAiMessages, setOpenAiMessages] = useState<ChatMessage[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>("");
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  // Ref to store the abort controller for stopping streaming
  const abortControllerRef = useRef<AbortController | null>(null);


  // Function to reset the chat
  const resetChat = useCallback(() => {
    setOpenAiMessages([]);
    setMessages([]);
    setInput("");
    setStatus("ready");
    setIsGenerating(false);

    // Abort any ongoing requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
    },
    []
  );

  // Helper: update OpenAI messages from streaming events
  const updateOpenAiMessagesFromStream = useCallback(
    (prev: ChatMessage[], event: StreamEvent): ChatMessage[] => {
      const updated = [...prev];

      switch (event.type) {
        case "chunk": {
          console.log("chunk", event.payload);
          const last = updated[updated.length - 1];
          if (last && last.role === "assistant" && !last.tool_calls) {
            last.content = (last.content || "") + event.payload;
          } else {
            updated.push({ role: "assistant", content: event.payload });
          }
          break;
        }
        case "tool_call": {
          console.log("tool_call", event.payload);
          const tc = event.payload;
          let assistantMsg = updated[updated.length - 1];
          if (!assistantMsg || assistantMsg.role !== "assistant") {
            assistantMsg = { role: "assistant", content: "", tool_calls: [] };
            updated.push(assistantMsg);
          }
          if (!assistantMsg.tool_calls) assistantMsg.tool_calls = [];
          assistantMsg.tool_calls.push(tc);
          break;
        }
        case "tool_result": {
          console.log("tool_result", event.payload);
          const tr = event.payload;
          updated.push({
            role: "tool",
            content: tr.content,
            tool_call_id: tr.tool_call_id,
          });
          break;
        }
      }

      return updated;
    },
    []
  );

  const append = useCallback(
    async (message: { role: "user"; content: string }) => {
      if (!llmClient) {
        console.error("LLMClient not available in useChat.");
        setStatus("error");
        return;
      }

      setStatus("submitted");
      setIsGenerating(true);

      // Add user message to OpenAI format
      const userOpenAiMessage: ChatMessage = {
        role: "user",
        content: message.content,
      };

      const updatedOpenAiMessages = [...openAiMessages, userOpenAiMessage];
      setOpenAiMessages(updatedOpenAiMessages);

      // Convert to UI format and add user message
      const userMessage = convertOpenAIMessages(userOpenAiMessage, {
        id: generateUniqueId(),
        createdAt: new Date(),
      })[0];

      const messagesWithUser = [...messages, userMessage];
      setMessages(messagesWithUser);

      let currentStreamAssistantMessageId: string | null = null;
      let openAiMessagesForCurrentTurn: ChatMessage[] = [];

      // Create abort controller for this request
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        await llmClient.streamChatResponse(
          updatedOpenAiMessages, // Pass full chat history
          (event: StreamEvent) => {
            // Check if request was aborted
            if (abortController.signal.aborted) {
              return;
            }

            openAiMessagesForCurrentTurn = updateOpenAiMessagesFromStream(
              openAiMessagesForCurrentTurn,
              event
            );

            // Generate stable ID for assistant message if first time
            if (
              !currentStreamAssistantMessageId &&
              openAiMessagesForCurrentTurn.some((m) => m.role === "assistant")
            ) {
              currentStreamAssistantMessageId = generateUniqueId();
            }

            // Convert streaming messages to UI format
            const uiMessagesForThisTurn = convertOpenAIMessages(
              openAiMessagesForCurrentTurn,
              { assistantMessageIdToReuse: currentStreamAssistantMessageId }
            );

            setMessages([...messagesWithUser, ...uiMessagesForThisTurn]);
            setStatus("streaming");
          },
          (err) => {
            if (!abortController.signal.aborted) {
              console.error("Streaming error:", err);
              setStatus("error");
              setIsGenerating(false);
            }
          },
          () => {
            if (!abortController.signal.aborted) {
              // Update OpenAI messages with final result
              setOpenAiMessages([...updatedOpenAiMessages, ...openAiMessagesForCurrentTurn]);
              setStatus("ready");
              setIsGenerating(false);
              currentStreamAssistantMessageId = null;
              openAiMessagesForCurrentTurn = [];
            }
          },
          modelName
        );
      } catch (err) {
        if (!abortController.signal.aborted) {
          console.error("Error during streaming:", err);
          setStatus("error");
          setIsGenerating(false);
        }
      }
    },
    [
      llmClient,
      modelName,
      openAiMessages,
      messages,
      updateOpenAiMessagesFromStream,
    ]
  );

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    setStatus("ready");
  }, []);

  const handleSubmit = useCallback(
    (
      event?: { preventDefault?: () => void },
      options?: { experimental_attachments?: FileList }
    ) => {
      if (event && event.preventDefault) {
        event.preventDefault();
      }
      if (!input.trim() || isGenerating) {
        return;
      }
      append({ role: "user", content: input });
      setInput("");
    },
    [input, append, isGenerating]
  );

  return {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    append,
    status,
    isGenerating,
    stop,
    setMessages, // Expose for external modifications if needed
    resetChat, // Expose reset function
  };
}

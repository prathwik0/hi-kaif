import {
  ChatMessage,
  type ChatMessageProps,
} from "@/components/chat/chat-message";
import { type Message } from "@/lib/message-utils";
import { TypingIndicator } from "@/components/chat/typing-indicator";

type AdditionalMessageOptions = Omit<ChatMessageProps, keyof Message>;

interface MessageListProps {
  messages: Message[];
  showTimeStamps?: boolean;
  isTyping?: boolean;
  messageOptions?:
    | AdditionalMessageOptions
    | ((message: Message) => AdditionalMessageOptions);
}

export function MessageList({
  messages,
  showTimeStamps = true,
  isTyping = false,
  messageOptions,
}: MessageListProps) {
  const renderedMessages: React.ReactNode[] = [];
  let i = 0;
  while (i < messages.length) {
    const message = messages[i];
    const additionalOptions =
      typeof messageOptions === "function"
        ? messageOptions(message)
        : messageOptions;

    if (message.role === "assistant") {
      const chainedAssistantMessages: Message[] = [];
      let j = i + 1;
      while (j < messages.length && messages[j].role === "assistant") {
        chainedAssistantMessages.push(messages[j]);
        j++;
      }

      renderedMessages.push(
        <ChatMessage
          key={message.id || `msg-${i}`}
          showTimeStamp={showTimeStamps}
          {...message}
          chainedAssistantMessages={chainedAssistantMessages}
          {...additionalOptions}
        />
      );
      i = j; // Move index past all grouped assistant messages
    } else {
      renderedMessages.push(
        <ChatMessage
          key={message.id || `msg-${i}`}
          showTimeStamp={showTimeStamps}
          {...message}
          // No need to explicitly pass chainedAssistantMessages={[]} as it's optional
          {...additionalOptions}
        />
      );
      i++;
    }
  }

  return (
    <div className="space-y-2 overflow-visible">
      {renderedMessages}
      {isTyping && <TypingIndicator />}
    </div>
  );
}

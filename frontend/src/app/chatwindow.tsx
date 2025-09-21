
import {
  forwardRef,
  useCallback,
  useRef,
  useState,
  useEffect,
  type ReactElement,
} from "react";
import { ThumbsDown, ThumbsUp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useChat } from "@/hooks/use-chat";
import { useTranscription } from "@/hooks/use-transcription";
import { type Message, type MessageUIPart } from "@/lib/message-utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAutoScroll } from "@/hooks/use-auto-scroll";
import { CopyButton } from "@/components/chat/copy-button";
import { MessageInput } from "@/components/chat/message-input";
import { MessageList } from "@/components/chat/message-list";
import { PromptSuggestions } from "@/components/chat/prompt-suggestions";
import { useChatContext } from "@/components/chat/chat-context";

const LANGUAGES: {
  value: string;
  label: string;
}[] = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "kn", label: "Kannada" },
];

interface ChatWindowProps {
  className?: string;
  initialQuery?: string;
  onClose?: () => void;
  hideControls?: boolean;
}

export default function ChatWindow({ initialQuery, onClose, hideControls }: ChatWindowProps) {
  const { llmClient, modelName, selectedLanguage, setSelectedLanguage } = useChatContext();

  useEffect(() => {
    const originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalBodyOverflow;
    };
  }, []);

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    append,
    status,
    isGenerating: chatIsGenerating,
    stop,
    resetChat,
  } = useChat({
    llmClient,
    modelName,
  });

  // Auto-submit initial query
  const submittedQueriesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (initialQuery && messages.length === 0 && !submittedQueriesRef.current.has(initialQuery)) {
      submittedQueriesRef.current.add(initialQuery);
      append({ role: "user", content: initialQuery });
    }
  }, [initialQuery, messages.length, append]);

  const { transcribeAudio, transcriptionStatus } = useTranscription({
    llmClient,
    selectedLanguage,
  });

  const {
    containerRef: scrollContainerRef,
    scrollToBottom,
    handleScroll: onScrollContainer,
    handleTouchStart: onTouchStartContainer,
    shouldAutoScroll,
    isScrolling,
    // currentDistanceFromBottom,
  } = useAutoScroll([messages]);

  const isGenerating = chatIsGenerating || transcriptionStatus === "transcribing";
  const isLoading = status === "loading";

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-md flex flex-col z-50">
      <div className="flex-1 relative min-h-0">
        <Chat
          messages={messages}
          handleSubmit={handleSubmit}
          input={input}
          handleInputChange={handleInputChange}
          isGenerating={isGenerating}
          stop={stop}
          transcribeAudio={transcribeAudio}
        //   suggestions={[
        //     "Hi, how are you?",
        //     "What's the current weather in London?",
        //     "What's the latest news in the stock market?",
        //   ]}
          suggestions={[]}
          append={append}
          selectedLanguage={selectedLanguage}
          onLanguageChange={setSelectedLanguage}
          resetChat={resetChat}
          scrollContainerRef={scrollContainerRef}
          onScrollContainer={onScrollContainer}
          onTouchStartContainer={onTouchStartContainer}
          shouldAutoScroll={shouldAutoScroll}
          isScrolling={isScrolling}
          scrollToBottom={scrollToBottom}
          onClose={onClose}
          hideControls={hideControls}
        />
      </div>
    </div>
  );
}

interface ChatHeaderProps {
  selectedLanguage: string;
  onLanguageChange: (newLanguage: string) => void;
}

function ChatHeader({
  selectedLanguage,
  onLanguageChange,
}: ChatHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 pt-3 pb-4.5">
      {/* <h3 className="font-medium">Researcher</h3> */}
      <div className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Select language"
            >
              <span className="text-xs font-medium">
                {LANGUAGES.find((lang) => lang.value === selectedLanguage)
                  ?.label.slice(0, 2)
                  .toUpperCase()}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {LANGUAGES.map((lang) => (
              <DropdownMenuItem
                key={lang.value}
                onSelect={() => onLanguageChange(lang.value)}
              >
                {lang.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <ThemeToggle className="h-8 w-8" />
      </div>
    </div>
  );
}

interface ChatProps {
  messages: Array<Message>;
  handleSubmit: (
    event?: { preventDefault?: () => void },
    options?: { experimental_attachments?: FileList }
  ) => void;
  input: string;
  handleInputChange: React.ChangeEventHandler<HTMLTextAreaElement>;
  isGenerating: boolean;
  stop: () => void;
  onRateResponse?: (
    messageId: string,
    rating: "thumbs-up" | "thumbs-down"
  ) => void;
  setMessages?: (messages: any[]) => void;
  transcribeAudio?: (blob: Blob) => Promise<string>;
  suggestions?: string[];
  append?: (message: { role: "user"; content: string }) => void;
  selectedLanguage: string;
  onLanguageChange: (newLanguage: string) => void;
  resetChat: () => void;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  onScrollContainer: () => void;
  onTouchStartContainer: (event: React.TouchEvent<HTMLDivElement>) => void;
  shouldAutoScroll?: boolean;
  isScrolling?: boolean;
  scrollToBottom?: () => void;
  onClose?: () => void;
  hideControls?: boolean;
  // currentDistanceFromBottom?: number;
}

function Chat({
  messages,
  handleSubmit,
  input,
  handleInputChange,
  stop,
  isGenerating,
  onRateResponse,
  setMessages,
  transcribeAudio,
  suggestions = [],
  append,
  selectedLanguage,
  onLanguageChange,
  resetChat,
  scrollContainerRef,
  onScrollContainer,
  onTouchStartContainer,
  shouldAutoScroll,
  scrollToBottom,
  isScrolling,
  onClose,
  hideControls,
}: // currentDistanceFromBottom,
ChatProps) {
  const lastMessage = messages.at(-1);
  const isEmpty = messages.length === 0;
  
  // Show typing indicator when:
  // 1. Last message is from user (waiting for response)
  // 2. Model is generating (thinking/processing)
  // 3. There are pending tool calls in the last assistant message
  const isTyping = 
    lastMessage?.role === "user" || 
    isGenerating ||
    (lastMessage?.role === "assistant" && 
     lastMessage.parts?.some(part => 
       part.type === "tool-invocation" && 
       (part.toolInvocation.state === "call" || part.toolInvocation.state === "partial-call")
     ));

  const messagesRef = useRef(messages);
  messagesRef.current = messages;


  // Enhanced stop function that marks pending tool calls as cancelled
  const handleStop = useCallback(() => {
    stop();

    if (!setMessages) return;

    const latestMessages = [...messagesRef.current];
    const lastAssistantMessage = latestMessages.findLast(
      (m) => m.role === "assistant"
    );

    if (!lastAssistantMessage) return;

    let needsUpdate = false;
    let updatedMessage = { ...lastAssistantMessage };

    if (lastAssistantMessage.parts && lastAssistantMessage.parts.length > 0) {
      const updatedParts = lastAssistantMessage.parts.map(
        (part): MessageUIPart => {
          if (
            part.type === "tool-invocation" &&
            part.toolInvocation &&
            part.toolInvocation.state === "call"
          ) {
            needsUpdate = true;
            return {
              type: "tool-invocation",
              toolInvocation: {
                ...part.toolInvocation,
                state: "result" as const,
                result: {
                  content: "Tool execution was cancelled",
                  __cancelled: true,
                },
              },
            };
          }
          return part;
        }
      );

      if (needsUpdate) {
        updatedMessage = {
          ...updatedMessage,
          parts: updatedParts,
        };
      }
    }

    if (needsUpdate) {
      const messageIndex = latestMessages.findIndex(
        (m) => m.id === lastAssistantMessage.id
      );
      if (messageIndex !== -1) {
        latestMessages[messageIndex] = updatedMessage;
        setMessages(latestMessages);
      }
    }
  }, [stop, setMessages, messagesRef]);

  const messageOptions = useCallback(
    (message: Message) => ({
      actions: onRateResponse ? (
        <>
          <div className="border-r pr-1">
            <CopyButton
              content={message.content}
              copyMessage="Copied response to clipboard!"
            />
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => onRateResponse(message.id, "thumbs-up")}
          >
            <ThumbsUp className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => onRateResponse(message.id, "thumbs-down")}
          >
            <ThumbsDown className="h-4 w-4" />
          </Button>
        </>
      ) : (
        <CopyButton
          content={message.content}
          copyMessage="Copied response to clipboard!"
        />
      ),
    }),
    [onRateResponse]
  );

  return (
    <div className="flex flex-col h-full gap-0">
      {/* Sticky Header */}
      <div className="sticky top-0 z-50 @container overflow-hidden">
        <div
          className="absolute z-40 inset-x-0 top-0 h-[100%] bg-gradient-to-b from-background/80 via-background/60 via-[90%] to-transparent @[72rem]:bg-none"
          aria-hidden="true"
        />
        <div className="relative z-50">
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <div className="flex items-center gap-4">
              <h3 className="font-medium">Researcher</h3>
            </div>
            <div className="flex items-center gap-1">
              {onClose && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={onClose}
                  aria-label="Close chat"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
              {!hideControls && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Select language"
                    >
                      <span className="text-xs font-medium">
                        {LANGUAGES.find((lang) => lang.value === selectedLanguage)
                          ?.label.slice(0, 2)
                          .toUpperCase()}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {LANGUAGES.map((lang) => (
                      <DropdownMenuItem
                        key={lang.value}
                        onSelect={() => onLanguageChange(lang.value)}
                      >
                        {lang.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <ThemeToggle className="h-8 w-8" />
            </div>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 min-h-0 relative">
        {/* Chat Content */}
        <div className="h-full m-0 absolute inset-0">
          <div
            ref={scrollContainerRef}
            onScroll={onScrollContainer}
            onTouchStart={onTouchStartContainer}
            className={cn("h-full overflow-y-auto")}
          >
            <div className="max-w-3xl mx-auto w-full flex flex-col min-h-full">
              {/* Ensure this div can fill height for the flex-1 spacer */}
              {isEmpty && append && suggestions && !isTyping ? (
                <div className="flex-1 overflow-y-auto">
                  <PromptSuggestions
                    label="Research any topic"
                    append={append}
                    suggestions={suggestions}
                  />
                </div>
              ) : null}
              {(messages.length > 0 || isTyping) ? (
                <div className="max-w-full pb-4 px-2 [grid-column:1/1] [grid-row:1/1]">
                  <MessageList
                    messages={messages}
                    isTyping={isTyping}
                    showTimeStamps={false}
                    messageOptions={messageOptions}
                  />
                </div>
              ) : null}
              {/* Empty div that grows to fill the space */}
              <div className="flex-1"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Chat Input - Conditionally Visible */}
      {!hideControls && (
        <div className="sticky bottom-0 left-0 right-0 z-10 rounded-md bg-gradient-to-t from-background/80 via-background/60 to-transparent dark:from-background/80 dark:via-background/60 dark:to-transparent">
          <div className="max-w-3xl mx-auto">
            <ChatForm
              className="mt-auto px-1.5"
              isPending={isGenerating || isTyping}
              handleSubmit={handleSubmit}
            >
              <MessageInput
                value={input}
                onChange={handleInputChange}
                stop={handleStop}
                isGenerating={isGenerating}
                transcribeAudio={transcribeAudio}
                shouldAutoScroll={shouldAutoScroll}
                scrollToBottom={scrollToBottom}
                resetChat={resetChat}
                isScrolling={isScrolling}
              />
            </ChatForm>
          </div>
        </div>
      )}
    </div>
  );
}
Chat.displayName = "Chat";

interface ChatFormProps {
  className?: string;
  isPending: boolean;
  handleSubmit: (
    event?: { preventDefault?: () => void },
    options?: { experimental_attachments?: FileList }
  ) => void;
  children: ReactElement;
}

const ChatForm = forwardRef<HTMLFormElement, ChatFormProps>(
  ({ children, handleSubmit, isPending, className }, ref) => {
    const [files, setFiles] = useState<File[] | null>(null);

    const onSubmit = (event: React.FormEvent) => {
      if (!files) {
        handleSubmit(event);
        return;
      }

      const fileList = createFileList(files);
      handleSubmit(event, { experimental_attachments: fileList });
      setFiles(null);
    };

    return (
      <form ref={ref} onSubmit={onSubmit} className={className}>
        {children}
      </form>
    );
  }
);
ChatForm.displayName = "ChatForm";

function createFileList(files: File[] | FileList): FileList {
  const dataTransfer = new DataTransfer();
  for (const file of Array.from(files)) {
    dataTransfer.items.add(file);
  }
  return dataTransfer.files;
}
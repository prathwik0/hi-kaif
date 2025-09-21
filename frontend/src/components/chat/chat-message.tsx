"use client";

import React, { useMemo, useState } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { motion } from "framer-motion";
import { Ban, ChevronRight, Loader2, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  type Message,
  type MessageUIPart,
  type ReasoningUIPart,
  type ToolInvocation,
} from "@/lib/message-utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { FilePreview } from "@/components/chat/file-preview";
import { MarkdownRenderer } from "@/components/chat/markdown-renderer";

const chatBubbleVariants = cva(
  "group/message relative break-words font-normal rounded-lg text-[15px] max-w-[94%]",
  {
    variants: {
      isUser: {
        true: "p-3 mr-2 mb-1 bg-muted text-foreground",
        false: "mx-2 mb-1 text-foreground w-full",
      },
      animation: {
        none: "",
        slide: "duration-300 animate-in fade-in-0",
        scale: "duration-300 animate-in fade-in-0 zoom-in-75",
        fade: "duration-500 animate-in fade-in-0",
      },
    },
    compoundVariants: [
      {
        isUser: true,
        animation: "slide",
        class: "slide-in-from-right",
      },
      {
        isUser: false,
        animation: "slide",
        class: "slide-in-from-left",
      },
      {
        isUser: true,
        animation: "scale",
        class: "origin-bottom-right",
      },
      {
        isUser: false,
        animation: "scale",
        class: "origin-bottom-left",
      },
    ],
  }
);

type Animation = VariantProps<typeof chatBubbleVariants>["animation"];

export interface ChatMessageProps extends Message {
  showTimeStamp?: boolean;
  animation?: Animation;
  actions?: React.ReactNode;
  chainedAssistantMessages?: Message[];
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  id,
  role,
  content,
  createdAt,
  showTimeStamp = false,
  animation = "scale",
  actions,
  experimental_attachments,
  parts: initialParts,
  chainedAssistantMessages,
}) => {
  const files = useMemo(() => {
    return experimental_attachments?.map((attachment) => {
      const dataArray = dataUrlToUint8Array(attachment.url);
      const file = new File([dataArray], attachment.name ?? "Unknown");
      return file;
    });
  }, [experimental_attachments]);

  const isUser = role === "user";

  const formattedTime = createdAt?.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (isUser) {
    return (
      <div
        className={cn("flex flex-col", isUser ? "items-end" : "items-start")}
      >
        {files ? (
          <div className="mb-1 flex flex-wrap gap-2">
            {files.map((file, index) => {
              return <FilePreview file={file} key={index} />;
            })}
          </div>
        ) : null}

        <div className={cn(chatBubbleVariants({ isUser, animation }))}>
          <MarkdownRenderer>{content}</MarkdownRenderer>
        </div>

        {showTimeStamp && createdAt ? (
          <time
            dateTime={createdAt.toISOString()}
            className={cn(
              "mt-1 mx-1 mb-2 block pr-1.5 text-xs opacity-50 ",
              animation !== "none" && "duration-500 animate-in fade-in-0"
            )}
          >
            {formattedTime}
          </time>
        ) : null}
      </div>
    );
  }

  // Assistant message specific logic
  const allParts: MessageUIPart[] = [];
  let primaryContentString: string | null = null;

  if (role === "assistant") {
    // Process primary message
    if (initialParts && initialParts.length > 0) {
      allParts.push(...initialParts);
    } else if (content && typeof content === "string") {
      // If no parts, but string content, treat as a text part
      allParts.push({ type: "text", text: content });
    } else if (content) {
      // Non-string content for primary message, store for fallback
      primaryContentString = JSON.stringify(content, null, 2);
    }

    // Process chained messages
    chainedAssistantMessages?.forEach((chainedMsg) => {
      if (chainedMsg.parts && chainedMsg.parts.length > 0) {
        allParts.push(...chainedMsg.parts);
      } else if (chainedMsg.content && typeof chainedMsg.content === "string") {
        allParts.push({ type: "text", text: chainedMsg.content });
      }
      // Non-string content from chained messages is ignored if not parts
    });
  } else {
    // For non-assistant, non-user roles (system, tool, etc.)
    if (initialParts && initialParts.length > 0) {
      allParts.push(...initialParts);
    } else if (content && typeof content === "string") {
      primaryContentString = content;
    } else if (content) {
      primaryContentString = JSON.stringify(content, null, 2);
    }
  }

  // Render for assistant (and potentially other non-user roles if they use parts)
  if (allParts.length > 0) {
    return (
      <div
        className={cn("flex flex-col", "items-start")} // Assuming non-user is items-start
      >
        <div className={cn(chatBubbleVariants({ isUser: false, animation }))}>
          {" "}
          {/* isUser is false for assistant */}
          {allParts.map((part, index) => {
            const key = `${id}-part-${index}`;
            if (part.type === "text") {
              return (
                // Add a small margin between text parts from different messages for readability if needed
                // For now, just concatenating them.
                <div
                  key={key}
                  className={
                    index > 0 && allParts[index - 1].type === "text"
                      ? "mt-2"
                      : ""
                  }
                >
                  <MarkdownRenderer>{part.text}</MarkdownRenderer>
                </div>
              );
            } else if (part.type === "reasoning") {
              return (
                <ReasoningBlock key={key} part={part as ReasoningUIPart} />
              );
            } else if (part.type === "tool-invocation") {
              const currentToolInvocation = part.toolInvocation;
              let showSuccess = false;

              const isCurrentNonProductResult =
                currentToolInvocation.state === "result" &&
                !(
                  typeof currentToolInvocation.result === "object" &&
                  currentToolInvocation.result !== null &&
                  "products" in currentToolInvocation.result &&
                  Array.isArray((currentToolInvocation.result as any).products)
                );

              if (isCurrentNonProductResult && index === allParts.length - 1) {
                showSuccess = true;
              }

              return (
                <ToolCall
                  key={key}
                  toolInvocations={[currentToolInvocation]}
                  showSuccessMessage={showSuccess}
                />
              );
            }
            // Handle other part types if they exist
            return null;
          })}
          {actions && role === "assistant" ? ( // Show actions only for the primary assistant message block
            <div className="absolute -bottom-4 right-2 flex space-x-1 rounded-lg border bg-background p-1 text-foreground opacity-0 transition-opacity group-hover/message:opacity-100">
              {actions}
            </div>
          ) : null}
        </div>
        {showTimeStamp && createdAt && role === "assistant" ? ( // Show timestamp for the primary assistant message block
          <time
            dateTime={createdAt.toISOString()}
            className={cn(
              "mt-1 mb-2 mx-1 block pl-1 text-xs opacity-50 ",
              animation !== "none" && "duration-500 animate-in fade-in-0"
            )}
          >
            {formattedTime}
          </time>
        ) : null}
      </div>
    );
  }

  // Fallback rendering for primaryContentString (e.g. simple assistant message or other roles)
  if (primaryContentString) {
    return (
      <div
        className={cn("flex flex-col", isUser ? "items-end" : "items-start")}
      >
        <div className={cn(chatBubbleVariants({ isUser, animation }))}>
          <MarkdownRenderer>{primaryContentString}</MarkdownRenderer>
          {actions ? (
            <div className="absolute -bottom-4 right-2 flex space-x-1 rounded-lg border bg-background p-1 text-foreground opacity-0 transition-opacity group-hover/message:opacity-100">
              {actions}
            </div>
          ) : null}
        </div>
        {showTimeStamp && createdAt ? (
          <time
            dateTime={createdAt.toISOString()}
            className={cn(
              "mt-1 block px-1 text-xs opacity-50 mx-1",
              animation !== "none" && "duration-500 animate-in fade-in-0"
            )}
          >
            {formattedTime}
          </time>
        ) : null}
      </div>
    );
  }

  return null; // Or some placeholder if appropriate
};

function dataUrlToUint8Array(data: string) {
  const base64 = data.split(",")[1];
  const buf = Buffer.from(base64, "base64");
  return new Uint8Array(buf);
}

const ReasoningBlock = ({ part }: { part: ReasoningUIPart }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mb-2 flex flex-col items-start sm:max-w-[70%]">
      <Collapsible
        open={isOpen}
        onOpenChange={setIsOpen}
        className="group w-full overflow-hidden rounded-lg border bg-muted/50"
      >
        <div className="flex items-center p-2">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <ChevronRight className="h-4 w-4 transition-transform group-data-[state=open]:rotate-90" />
              <span>Thinking</span>
            </button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent forceMount>
          <motion.div
            initial={false}
            animate={isOpen ? "open" : "closed"}
            variants={{
              open: { height: "auto", opacity: 1 },
              closed: { height: 0, opacity: 0 },
            }}
            transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="border-t"
          >
            <div className="p-2">
              <div className="whitespace-pre-wrap text-xs">
                {part.reasoning}
              </div>
            </div>
          </motion.div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

interface ToolCallProps {
  toolInvocations: ToolInvocation[];
  showSuccessMessage?: boolean;
}

function ToolCall({ toolInvocations, showSuccessMessage }: ToolCallProps) {
  if (!toolInvocations?.length) return null;

  return (
    <div className="flex flex-col items-start gap-2">
      {toolInvocations.map((invocation, index) => {
        const isCancelled =
          invocation.state === "result" &&
          invocation.result.__cancelled === true;

        if (isCancelled) {
          return (
            <div
              key={index}
              className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
            >
              <Ban className="h-4 w-4" />
              <span>
                Cancelled{" "}
                <span className="font-mono">
                  {"`"}
                  {invocation.toolName}
                  {"`"}
                </span>
              </span>
            </div>
          );
        }

        switch (invocation.state) {
          case "partial-call":
          case "call":
            return (
              <div
                key={index}
                className="flex items-center gap-2 rounded-lg border bg-muted/50 my-2 px-2 text-sm text-muted-foreground"
              >
                <Search className="h-4 w-4" />
                <span>
                  Working on it ...
                  <span className="font-mono">
                    {"`"}
                    {invocation.toolName}
                    {"`"}
                  </span>
                </span>
                <Loader2 className="h-3 w-3 animate-spin" />
              </div>
            );
          case "result": {
            const resultData = invocation.result;
            // console.log(resultData);
            
            if (typeof resultData === "object" && resultData !== null && "wikipedia_search" in resultData) {
              return (
                <React.Fragment key={index}>
                  <WikipediaResults result={resultData as WikipediaResult} />
                </React.Fragment>
              );
            }

            if (typeof resultData === "object" && resultData !== null && "final_result_tool" in resultData) {
              return (
                <React.Fragment key={index}>
                  <FinalResultCard result={resultData as FinalResultData} />
                </React.Fragment>
              );
            }

            if (typeof resultData === "object"){
              return <div key={index}>
                {JSON.stringify(resultData)}
              </div>
            } else {
              if (showSuccessMessage) {
                return (
                  <div
                    key={index}
                    className="flex items-center gap-2 rounded-lg border bg-muted/50 my-2 px-2 text-sm text-muted-foreground"
                  >
                    <Search className="h-4 w-4" />
                    <span>Working on it ...</span>
                    <Loader2 className="h-3 w-3 animate-spin" />
                  </div>
                );
              } else {
                return null;
              }
            }
          }
          default:
            return null;
        }
      })}
    </div>
  );
}

interface FinalResultData {
  final_result_tool: boolean;
  title: string;
  keywords: string[];
  introduction: string;
  content: string;
  conclusion: string;
  references: Array<{
    title: string;
    url?: string;
    type: string;
    accessed_date?: string;
  }>;
  thumbnail?: string;
  images?: Array<{
    url: string;
    description?: string;
  }>;
  timestamp: string;
  success: boolean;
  processed: boolean;
}

interface WikipediaResult {
  search_query: string;
  results: Array<{
    title: string;
    snippet: string;
    pageid: number;
    wordcount: number;
    timestamp: string;
    content: string;
    url: string;
  }>;
  total_results: number;
  success: boolean;
}

interface FinalResultCardProps {
  result: FinalResultData;
}

function FinalResultCard({ result }: FinalResultCardProps) {
  const [introductionOpen, setIntroductionOpen] = useState(true);
  const [contentOpen, setContentOpen] = useState(true);
  const [conclusionOpen, setConclusionOpen] = useState(true);
  const [referencesOpen, setReferencesOpen] = useState(true);

  return (
    <div className="w-full max-w-4xl mx-auto my-4 space-y-6 border border-border rounded-xl bg-background p-4 shadow-sm">
      {/* Hero Section with Thumbnail and Keywords */}
      {result.thumbnail && (
        <div className="relative rounded-xl overflow-hidden shadow-lg">
          <a
            href={result.thumbnail}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            <img
              src={result.thumbnail}
              alt="Research topic thumbnail"
              className="w-full h-48 md:h-64 object-cover"
            />
          </a>
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6">
            <h1 className="text-2xl md:text-3xl font-bold text-white mb-3">
              {result.title}
            </h1>
            <div className="flex flex-wrap gap-2">
              {result.keywords.map((keyword, index) => (
                <span
                  key={index}
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-white/20 backdrop-blur-sm text-white border border-white/30"
                >
                  {keyword}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Fallback title if no thumbnail */}
      {!result.thumbnail && (
        <div className="text-center py-6">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
            {result.title}
          </h1>
          <div className="flex flex-wrap justify-center gap-2">
            {result.keywords.map((keyword, index) => (
              <span
                key={index}
                className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-primary/10 text-primary"
              >
                {keyword}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Content Sections */}
      <div className="space-y-4">
          {/* Introduction Section */}
          <Collapsible open={introductionOpen} onOpenChange={setIntroductionOpen}>
            <div className="flex items-center justify-between py-2">
              <h3 className="text-lg font-semibold text-foreground">Introduction</h3>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <span>{introductionOpen ? 'Hide' : 'Show'}</span>
                  <ChevronRight className={cn("h-4 w-4 transition-transform", introductionOpen && "rotate-90")} />
                </button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent>
              <div className="prose prose-sm max-w-none text-foreground/90 leading-relaxed">
                <MarkdownRenderer>{result.introduction}</MarkdownRenderer>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Images Section */}
          {Array.isArray(result.images) && result.images.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 py-4">
              {result.images.slice(0, 6).map((image, index) => (
                <div key={index} className="group">
                  <a
                    href={image.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block overflow-hidden rounded-lg shadow-sm hover:shadow-md transition-shadow"
                  >
                    <img
                      src={image.url}
                      alt={image.description || `Related image ${index + 1}`}
                      className="w-full h-32 object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </a>
                  {image.description && (
                    <p className="text-xs text-muted-foreground mt-2 px-1">
                      {image.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Content Section */}
          <Collapsible open={contentOpen} onOpenChange={setContentOpen}>
            <div className="flex items-center justify-between py-2">
              <h3 className="text-lg font-semibold text-foreground">Content</h3>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <span>{contentOpen ? 'Hide' : 'Show'}</span>
                  <ChevronRight className={cn("h-4 w-4 transition-transform", contentOpen && "rotate-90")} />
                </button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent>
              <div className="prose prose-sm max-w-none text-foreground/90 leading-relaxed">
                <MarkdownRenderer>{result.content}</MarkdownRenderer>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Conclusion Section */}
          <Collapsible open={conclusionOpen} onOpenChange={setConclusionOpen}>
            <div className="flex items-center justify-between py-2">
              <h3 className="text-lg font-semibold text-foreground">Conclusion</h3>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <span>{conclusionOpen ? 'Hide' : 'Show'}</span>
                  <ChevronRight className={cn("h-4 w-4 transition-transform", conclusionOpen && "rotate-90")} />
                </button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent>
              <div className="prose prose-sm max-w-none text-foreground/90 leading-relaxed">
                <MarkdownRenderer>{result.conclusion}</MarkdownRenderer>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* References Section */}
          {result.references && result.references.length > 0 && (
            <Collapsible open={referencesOpen} onOpenChange={setReferencesOpen}>
              <div className="flex items-center justify-between py-2">
                <h3 className="text-lg font-semibold text-foreground">References</h3>
                <CollapsibleTrigger asChild>
                  <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <span>{referencesOpen ? 'Hide' : 'Show'}</span>
                    <ChevronRight className={cn("h-4 w-4 transition-transform", referencesOpen && "rotate-90")} />
                  </button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent>
                <div className="space-y-3 mt-4">
                  {result.references.map((ref, index) => (
                    <div key={index} className="flex items-start gap-4 p-4 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors">
                      <span className="text-sm font-medium text-muted-foreground min-w-[24px] mt-0.5">
                        [{index + 1}]
                      </span>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          {ref.url ? (
                            <a
                              href={ref.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-medium text-primary hover:underline"
                            >
                              {ref.title}
                            </a>
                          ) : (
                            <span className="text-sm font-medium text-foreground">{ref.title}</span>
                          )}
                          <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full border border-primary/20">
                            {ref.type}
                          </span>
                        </div>
                        {ref.accessed_date && (
                          <div className="text-xs text-muted-foreground">
                            Accessed: {new Date(ref.accessed_date).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Footer */}
          <div className="pt-6 border-t border-border/50">
            <div className="text-xs text-muted-foreground text-center">
              Research completed on {new Date(result.timestamp).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          </div>
      </div>
    </div>
  );
}

interface WikipediaResultsProps {
  result: WikipediaResult;
}

function WikipediaResults({ result }: WikipediaResultsProps) {
  if (!result.success || !result.results?.length) {
    return (
      <div className="text-sm text-muted-foreground">
        No Wikipedia results found for "{result.search_query}"
      </div>
    );
  }

  return (
    <div className="w-full space-y-2 pb-2">
      <div className="text-sm font-medium text-muted-foreground pl-1.5">
        Wikipedia results for "{result.search_query}" ({result.total_results})
      </div>
      <div className="w-full space-y-0 bg-background border border-border/50 rounded-md overflow-hidden">
        {result.results.map((item, index) => (
          <Collapsible key={item.pageid} className="group">
            <div className={cn(
              "cursor-pointer hover:bg-muted/30 transition-colors py-1.5 px-1.5",
              index > 0 && "border-t border-border/50"
            )}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium hover:underline"
                  >
                    {item.title}
                  </a>
                  <div className="text-xs text-foreground">
                    <div className="flex justify-between items-center text-xs">
                      <span>{item.wordcount.toLocaleString()} words</span>
                      <span><span className="hidden sm:inline">Updated:</span> {new Date(item.timestamp).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
                <CollapsibleTrigger asChild>
                  <ChevronRight className="h-3 w-3 text-muted-foreground transition-transform group-data-[state=open]:rotate-90 flex-shrink-0 cursor-pointer mt-0.5" />
                </CollapsibleTrigger>
              </div>
            </div>
            <CollapsibleContent>
              <div className="mt-1 pl-2 border-t border-border/50">
                <div className="max-h-64 overflow-y-auto leading-relaxed">
                  <MarkdownRenderer>{item.content}</MarkdownRenderer>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>
    </div>
  );
}

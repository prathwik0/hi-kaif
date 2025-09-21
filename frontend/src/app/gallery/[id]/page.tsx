"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useChatContext } from "@/components/chat/chat-context";
import { ResearchDetail } from "@/lib/api";
import { Calendar, ArrowLeft, Tag, Clock, FileText, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MarkdownRenderer } from "@/components/chat/markdown-renderer";
import { cn } from "@/lib/utils";

export default function ResearchDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { llmClient } = useChatContext();
  const [research, setResearch] = useState<ResearchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [introductionOpen, setIntroductionOpen] = useState(true);
  const [contentOpen, setContentOpen] = useState(true);
  const [conclusionOpen, setConclusionOpen] = useState(true);
  const [referencesOpen, setReferencesOpen] = useState(true);

  useEffect(() => {
    const fetchResearch = async () => {
      if (!id || typeof id !== 'string') return;

      try {
        setLoading(true);
        const researchId = parseInt(id, 10);
        if (isNaN(researchId)) {
          setError("Invalid research ID");
          return;
        }

        const data = await llmClient.fetchResearchById(researchId);
        setResearch(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch research");
      } finally {
        setLoading(false);
      }
    };

    fetchResearch();
  }, [id, llmClient]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading research details...</p>
        </div>
      </div>
    );
  }

  if (error || !research) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-destructive mb-4">Error: {error || "Research not found"}</p>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 flex items-center gap-2 mx-auto"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const formattedDate = new Date(research.created_at).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const formattedTime = new Date(research.created_at).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="container mx-auto px-4 py-4">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Gallery
          </button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Hero Section */}
        <div className="mb-8">
          <div className="relative h-64 md:h-96 rounded-lg overflow-hidden mb-6">
            {research.thumbnail ? (
              <img
                src={research.thumbnail}
                alt={research.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 flex items-center justify-center">
                <div className="text-primary/60 text-6xl">📚</div>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-6">
              <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
                {research.title}
              </h1>
              <div className="flex flex-wrap items-center gap-4 text-white/90">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  <span>{formattedDate}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>{formattedTime}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Keywords */}
          {research.keywords && research.keywords.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Tag className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Keywords</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {research.keywords.map((keyword, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Research Details */}
        {research.details && (() => {
          let details;
          try {
            details = typeof research.details === 'string'
              ? JSON.parse(research.details)
              : research.details;
          } catch (e) {
            // If parsing fails, treat as raw string
            return (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="w-5 h-5 text-muted-foreground" />
                  <h2 className="text-xl font-semibold">Research Details</h2>
                </div>
                <div className="bg-card rounded-lg border p-6">
                  <pre className="whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed">
                    {research.details}
                  </pre>
                </div>
              </div>
            );
          }

          return (
            <div className="mb-8">
              <div className="space-y-4">
                {/* Introduction Section */}
                {details.introduction && (
                  <Collapsible open={introductionOpen} onOpenChange={setIntroductionOpen}>
                    <div className="flex items-center justify-between py-2">
                      <h3 className="text-2xl font-semibold text-foreground">Introduction</h3>
                      <CollapsibleTrigger asChild>
                        <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                          <span>{introductionOpen ? 'Hide' : 'Show'}</span>
                          <ChevronRight className={cn("h-4 w-4 transition-transform", introductionOpen && "rotate-90")} />
                        </button>
                      </CollapsibleTrigger>
                    </div>
                    <CollapsibleContent>
                      <div className="prose prose-sm max-w-none text-foreground/90 leading-relaxed">
                        <MarkdownRenderer>{details.introduction}</MarkdownRenderer>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* Images Section */}
                {Array.isArray(details.images) && details.images.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 py-4">
                    {details.images.slice(0, 6).map((image: any, index: number) => (
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
                {details.content && (
                  <Collapsible open={contentOpen} onOpenChange={setContentOpen}>
                    <div className="flex items-center justify-between py-2">
                      <h3 className="text-2xl font-semibold text-foreground">Content</h3>
                      <CollapsibleTrigger asChild>
                        <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                          <span>{contentOpen ? 'Hide' : 'Show'}</span>
                          <ChevronRight className={cn("h-4 w-4 transition-transform", contentOpen && "rotate-90")} />
                        </button>
                      </CollapsibleTrigger>
                    </div>
                    <CollapsibleContent>
                      <div className="prose prose-sm max-w-none text-foreground/90 leading-relaxed">
                        <MarkdownRenderer>{details.content}</MarkdownRenderer>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* Conclusion Section */}
                {details.conclusion && (
                  <Collapsible open={conclusionOpen} onOpenChange={setConclusionOpen}>
                    <div className="flex items-center justify-between py-2">
                      <h3 className="text-2xl font-semibold text-foreground">Conclusion</h3>
                      <CollapsibleTrigger asChild>
                        <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                          <span>{conclusionOpen ? 'Hide' : 'Show'}</span>
                          <ChevronRight className={cn("h-4 w-4 transition-transform", conclusionOpen && "rotate-90")} />
                        </button>
                      </CollapsibleTrigger>
                    </div>
                    <CollapsibleContent>
                      <div className="prose prose-sm max-w-none text-foreground/90 leading-relaxed">
                        <MarkdownRenderer>{details.conclusion}</MarkdownRenderer>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* References Section */}
                {details.references && Array.isArray(details.references) && details.references.length > 0 && (
                  <Collapsible open={referencesOpen} onOpenChange={setReferencesOpen}>
                    <div className="flex items-center justify-between py-2">
                      <h3 className="text-2xl font-semibold text-foreground">References</h3>
                      <CollapsibleTrigger asChild>
                        <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                          <span>{referencesOpen ? 'Hide' : 'Show'}</span>
                          <ChevronRight className={cn("h-4 w-4 transition-transform", referencesOpen && "rotate-90")} />
                        </button>
                      </CollapsibleTrigger>
                    </div>
                    <CollapsibleContent>
                      <div className="space-y-3 mt-4">
                        {details.references.map((ref: any, index: number) => (
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
                                {ref.type && (
                                  <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full border border-primary/20">
                                    {ref.type}
                                  </span>
                                )}
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
              </div>
            </div>
          );
        })()}

        {/* Research Logs */}
        {research.logs && research.logs.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Research Conversation</h2>
            <div className="space-y-4">
              {research.logs.map((log: any, index: number) => (
                <div key={index} className="bg-card rounded-lg border p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                      log.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {log.role === 'user' ? 'U' : 'A'}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium capitalize">{log.role}</span>
                        {log.timestamp && (
                          <span className="text-xs text-muted-foreground">
                            {new Date(log.timestamp).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {typeof log.content === 'string' ? log.content : JSON.stringify(log.content, null, 2)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className="border-t pt-6">
          <h3 className="text-lg font-semibold mb-4">Metadata</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium text-muted-foreground">Research ID:</span>
              <span className="ml-2">{research.researchID}</span>
            </div>
            <div>
              <span className="font-medium text-muted-foreground">Created:</span>
              <span className="ml-2">{formattedDate} at {formattedTime}</span>
            </div>
            <div>
              <span className="font-medium text-muted-foreground">Last Updated:</span>
              <span className="ml-2">
                {new Date(research.updated_at).toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })} at {new Date(research.updated_at).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
            </div>
            {research.details_created_at && (
              <div>
                <span className="font-medium text-muted-foreground">Details Added:</span>
                <span className="ml-2">
                  {new Date(research.details_created_at).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

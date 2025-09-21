"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useChatContext } from "@/components/chat/chat-context";
import { ResearchItem } from "@/lib/api";
import { Calendar, Tag, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function GalleryPage() {
  const { llmClient } = useChatContext();
  const [researchItems, setResearchItems] = useState<ResearchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchResearch = async () => {
      try {
        setLoading(true);
        const items = await llmClient.fetchResearch();
        setResearchItems(items);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch research");
      } finally {
        setLoading(false);
      }
    };

    fetchResearch();
  }, [llmClient]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading research gallery...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-4">Error: {error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/">
              <Button variant="ghost" size="icon" aria-label="Back to chat">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-4xl font-bold text-foreground">Research Gallery</h1>
              <p className="text-muted-foreground">
                Explore your research topics and discoveries
              </p>
            </div>
          </div>
        </div>

        {researchItems.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-lg">No research items found.</p>
            <p className="text-muted-foreground text-sm mt-2">
              Start a conversation to create your first research topic!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
            {researchItems.map((item) => (
              <ResearchCard key={item.researchID} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface ResearchCardProps {
  item: ResearchItem;
}

function ResearchCard({ item }: ResearchCardProps) {
  const formattedDate = new Date(item.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  return (
    <div className="group relative overflow-hidden rounded-t-xl rounded-b-lg border border-border bg-background transition-all duration-300 cursor-pointer">
      <div className="relative h-36 overflow-hidden rounded-t-xl">
        {item.thumbnail ? (
          <img
            src={item.thumbnail}
            alt={item.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 flex items-center justify-center">
            <div className="text-primary/60 text-4xl">📚</div>
          </div>
        )}

        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Keywords at bottom of image */}
        {item.keywords && item.keywords.length > 0 && (
          <div className="absolute bottom-3 left-3 right-3 z-10 flex flex-wrap gap-1.5">
            {item.keywords.slice(0, 3).map((keyword, index) => (
              <Badge
                key={index}
                variant="secondary"
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-transparent text-gray-800 border border-white/50 backdrop-blur-md shadow-sm"
              >
                {keyword}
              </Badge>
            ))}
            {item.keywords.length > 3 && (
              <Badge
                variant="secondary"
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-transparent text-gray-800 border border-white/50 backdrop-blur-md shadow-sm"
              >
                +{item.keywords.length - 3}
              </Badge>
            )}
          </div>
        )}
      </div>

      <div className="p-3 space-y-3">
        {/* Title below image */}
        <div>
          <h3 className="text-foreground text-base font-semibold leading-tight line-clamp-2 group-hover:text-primary transition-colors">
            {item.title}
          </h3>
        </div>

        {/* Date and metadata */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Calendar className="w-4 h-4" />
            <span>{formattedDate}</span>
          </div>
          {item.keywords?.length ? (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Tag className="w-4 h-4" />
              <span>{item.keywords.length}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useEffect, useRef, useState } from "react";
import { useChatContext } from "@/components/chat/chat-context";
import { ResearchItem } from "@/lib/api";
import { Calendar } from "lucide-react";

export default function GalleryPage() {
  const { llmClient } = useChatContext();
  const [researchItems, setResearchItems] = useState<ResearchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [columnsCount, setColumnsCount] = useState(10);
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isAdjustingRef = useRef(false);

  const setColumnRef = (index: number) => (el: HTMLDivElement | null) => {
    columnRefs.current[index] = el;
  };

  const ensureLoopBounds = (el: HTMLDivElement | null) => {
    if (!el) return;
    const half = el.scrollHeight / 2; // content duplicated exactly 2x
    if (half <= 0) return;
    const epsilon = 2; // keep away from exact edges to avoid bounce

    let normalized = el.scrollTop % half;
    if (normalized < 0) normalized += half; // safety for any odd browsers

    if (normalized < epsilon) {
      normalized = half - (epsilon - normalized);
    } else if (normalized > half - epsilon) {
      normalized = normalized - (half - epsilon);
    }

    if (Math.abs(normalized - el.scrollTop) > 0.5) {
      isAdjustingRef.current = true;
      el.scrollTop = normalized;
      requestAnimationFrame(() => {
        isAdjustingRef.current = false;
      });
    }
  };

  const onColumnScroll = (index: number) => {
    const el = columnRefs.current[index];
    if (!el || isAdjustingRef.current) return;
    requestAnimationFrame(() => ensureLoopBounds(el));
  };

  const onColumnWheel = (index: number) => {
    const el = columnRefs.current[index];
    if (!el || isAdjustingRef.current) return;
    // After wheel applies, verify bounds on next frame so it works for both up/down
    requestAnimationFrame(() => ensureLoopBounds(el));
  };

  useEffect(() => {
    const fetchResearch = async () => {
      try {
        setLoading(true);
        let items = await llmClient.fetchResearch();

        // Duplicate and randomize items until we have at least 200 (cards are duplicated within rows)
        const minItems = 200;
        if (items.length > 0) {
          const duplicatedItems: ResearchItem[] = [];
          while (duplicatedItems.length < minItems) {
            const shuffled = [...items].sort(() => Math.random() - 0.5);
            duplicatedItems.push(...shuffled);
          }
          items = duplicatedItems.slice(0, minItems);
        }

        setResearchItems(items);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch research");
      } finally {
        setLoading(false);
      }
    };

    fetchResearch();
  }, [llmClient]);

  // Determine how many columns fit the viewport
  useEffect(() => {
    const computeColumns = () => {
      const cardWidth = 196; // 192px (w-48) + 4px (gap-1)
      const cols = Math.max(1, Math.ceil(window.innerWidth / cardWidth) + 2);
      setColumnsCount(cols);
    };
    computeColumns();
    window.addEventListener('resize', computeColumns);
    return () => window.removeEventListener('resize', computeColumns);
  }, []);

  // Initialize each column around the middle so user can scroll up or down seamlessly
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      columnRefs.current.forEach((el) => {
        if (!el) return;
        const half = el.scrollHeight / 2;
        if (half > 0) {
          el.scrollTop = Math.max(1, Math.floor(half / 2));
        }
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [columnsCount, researchItems.length]);

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

  // Create independently scrollable, seamless columns
  const columns: React.ReactElement[] = [];
  for (let col = 0; col < columnsCount; col++) {
    const columnItems = researchItems.filter((_, idx) => idx % columnsCount === col);
    const duplicatedColumnItems = [...columnItems, ...columnItems]; // exactly 2x for seamless loop

    columns.push(
      <div key={col} className="h-full w-48 flex-shrink-0 overflow-hidden">
        <div
          ref={setColumnRef(col)}
          onScroll={() => onColumnScroll(col)}
          onWheel={() => onColumnWheel(col)}
          className="h-full flex flex-col gap-1 overflow-y-scroll hide-scrollbar"
        >
          {duplicatedColumnItems.map((item, index) => (
            <ResearchCard key={`${item.researchID}-c${col}-${index}`} item={item} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-background fixed inset-0">
      <div className="h-full w-full p-1 overflow-hidden">
        <div className="h-full w-full flex gap-1 overflow-hidden">
          {columns}
        </div>
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
    <div className="group relative overflow-hidden rounded-lg border border-border bg-background transition-all duration-300 cursor-pointer w-48 flex-shrink-0">
      <div className="relative h-36 overflow-hidden rounded-lg">
        {item.thumbnail ? (
          <img
            src={item.thumbnail}
            alt={item.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110 contrast-80"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 flex items-center justify-center">
            <div className="text-primary/60 text-2xl">📚</div>
          </div>
        )}

        {/* Text overlay */}
        <div className="absolute inset-0 px-2 py-1 flex flex-col justify-end">
          {/* Semi-transparent background for text readability */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/50 to-transparent h-16 rounded-b-lg"></div>
          <div className="relative z-10">
            <h3 className="text-white text-sm font-bold leading-tight line-clamp-1 group-hover:text-primary transition-colors drop-shadow-lg">
              {item.title}
            </h3>
            <div className="flex text-sm items-center gap-1 text-yellow-300 drop-shadow-md">
              <Calendar className="w-3 h-3" />
              <span>{formattedDate}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

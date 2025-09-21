"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { LLMClient, ResearchItem } from "@/lib/api";

interface ChatContextType {
  llmClient: LLMClient;
  modelName: string;
  selectedLanguage: string;
  setSelectedLanguage: (language: string) => void;
  // Gallery data
  researchItems: ResearchItem[];
  galleryLoading: boolean;
  galleryError: string | null;
  fetchGalleryData: () => Promise<void>;
  clearGalleryData: () => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

interface ChatProviderProps {
  children: ReactNode;
  apiUrl: string;
  modelName: string;
}

export function ChatProvider({ children, apiUrl, modelName }: ChatProviderProps) {
  const [selectedLanguage, setSelectedLanguage] = useState<string>("en");
  const [llmClient] = useState(() => new LLMClient(apiUrl, modelName));

  // Gallery state - persists across navigation
  const [researchItems, setResearchItems] = useState<ResearchItem[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryError, setGalleryError] = useState<string | null>(null);

  const fetchGalleryData = async () => {
    // Don't fetch if already loading or if we have data
    if (galleryLoading || researchItems.length > 0) return;

    try {
      setGalleryLoading(true);
      setGalleryError(null);

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
      setGalleryError(err instanceof Error ? err.message : "Failed to fetch research");
    } finally {
      setGalleryLoading(false);
    }
  };

  const clearGalleryData = () => {
    setResearchItems([]);
    setGalleryError(null);
    // Note: We don't reset loading state here as it might be in progress
  };

  const value: ChatContextType = {
    llmClient,
    modelName,
    selectedLanguage,
    setSelectedLanguage,
    researchItems,
    galleryLoading,
    galleryError,
    fetchGalleryData,
    clearGalleryData,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatContext() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return context;
}

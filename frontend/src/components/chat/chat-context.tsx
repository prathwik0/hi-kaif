"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { LLMClient } from "@/lib/api";

interface ChatContextType {
  llmClient: LLMClient;
  modelName: string;
  selectedLanguage: string;
  setSelectedLanguage: (language: string) => void;
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

  const value: ChatContextType = {
    llmClient,
    modelName,
    selectedLanguage,
    setSelectedLanguage,
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

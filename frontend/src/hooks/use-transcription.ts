import { useCallback, useState } from "react";
import { type LLMClient } from "../lib/api";

type TranscriptionStatus = "ready" | "transcribing" | "error";

export function useTranscription({
  llmClient,
  selectedLanguage,
}: {
  llmClient: LLMClient | null; // Pass the initialized LLMClient instance
  selectedLanguage: string;
}) {
  const [transcriptionStatus, setTranscriptionStatus] =
    useState<TranscriptionStatus>("ready");

  const transcribeAudio = useCallback(
    async (blob: Blob): Promise<string> => {
      if (!llmClient) {
        console.error("LLMClient not initialized yet for transcription.");
        setTranscriptionStatus("error");
        throw new Error("Client not ready.");
      }
      setTranscriptionStatus("transcribing");
      try {
        const transcription = await llmClient.transcribeAudio(
          blob,
          selectedLanguage
        );
        setTranscriptionStatus("ready");
        return transcription;
      } catch (err) {
        console.error("Error during transcription:", err);
        setTranscriptionStatus("error");
        throw err;
      }
    },
    [llmClient, selectedLanguage]
  );

  return {
    transcribeAudio,
    transcriptionStatus,
  };
}

"use client";

import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUp,
  Info,
  Loader2,
  Mic,
  Paperclip,
  Square,
  ArrowDown,
  Plus,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useAudioRecording } from "@/hooks/use-audio-recording";
import { useAutosizeTextArea } from "@/hooks/use-autosize-textarea";
import { AudioVisualizer } from "@/components/chat/audio-visualizer";
import { Button } from "@/components/ui/button";
import { FilePreview } from "@/components/chat/file-preview";
import { InterruptPrompt } from "@/components/chat/interrupt-prompt";

interface MessageInputBaseProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string;
  submitOnEnter?: boolean;
  stop?: () => void;
  isGenerating: boolean;
  enableInterrupt?: boolean;
  transcribeAudio?: (blob: Blob) => Promise<string>;
  shouldAutoScroll?: boolean;
  scrollToBottom?: () => void;
  isScrolling?: boolean;
  resetChat?: () => void;
}

interface MessageInputWithoutAttachmentProps extends MessageInputBaseProps {
  allowAttachments?: false;
}

interface MessageInputWithAttachmentsProps extends MessageInputBaseProps {
  allowAttachments: true;
  files: File[] | null;
  setFiles: React.Dispatch<React.SetStateAction<File[] | null>>;
}

type MessageInputProps =
  | MessageInputWithoutAttachmentProps
  | MessageInputWithAttachmentsProps;

// Helper function to omit properties from an object
const omit = <T extends object, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> => {
  const newObj = { ...obj };
  keys.forEach((key) => {
    delete newObj[key];
  });
  return newObj;
};

export function MessageInput({
  placeholder = "Ask AI...",
  className,
  onKeyDown: onKeyDownProp,
  submitOnEnter = true,
  stop,
  isGenerating,
  enableInterrupt = true,
  transcribeAudio,
  shouldAutoScroll,
  scrollToBottom,
  resetChat,
  isScrolling,
  ...props
}: MessageInputProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [showInterruptPrompt, setShowInterruptPrompt] = useState(false);

  const {
    isListening,
    isSpeechSupported,
    isRecording,
    isTranscribing,
    audioStream,
    toggleListening,
    stopRecording,
  } = useAudioRecording({
    transcribeAudio,
    onTranscriptionComplete: (text) => {
      const newText = props.value ? props.value + " " + text : text;
      props.onChange?.({ target: { value: newText } } as any);
      textAreaRef.current?.focus();
    },
  });

  useEffect(() => {
    if (!isGenerating) {
      setShowInterruptPrompt(false);
    }
  }, [isGenerating]);

  useEffect(() => {
    if (!isGenerating) {
      // Focus back to the input after generation is complete
      setTimeout(() => {
        textAreaRef.current?.focus();
      }, 100);
    }
  }, [isGenerating]);

  const addFiles = (files: File[] | null) => {
    if (props.allowAttachments) {
      props.setFiles((currentFiles) => {
        if (currentFiles === null) {
          return files;
        }

        if (files === null) {
          return currentFiles;
        }

        return [...currentFiles, ...files];
      });
    }
  };

  const onDragOver = (event: React.DragEvent) => {
    if (props.allowAttachments !== true) return;
    event.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (event: React.DragEvent) => {
    if (props.allowAttachments !== true) return;
    event.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (event: React.DragEvent) => {
    setIsDragging(false);
    if (props.allowAttachments !== true) return;
    event.preventDefault();
    const dataTransfer = event.dataTransfer;
    if (dataTransfer.files.length) {
      addFiles(Array.from(dataTransfer.files));
    }
  };

  const onPaste = (event: React.ClipboardEvent) => {
    const items = event.clipboardData?.items;
    if (!items) return;

    const text = event.clipboardData.getData("text");
    if (text && text.length > 500 && props.allowAttachments) {
      event.preventDefault();
      const blob = new Blob([text], { type: "text/plain" });
      const file = new File([blob], "Pasted text", {
        type: "text/plain",
        lastModified: Date.now(),
      });
      addFiles([file]);
      return;
    }

    const files = Array.from(items)
      .map((item) => item.getAsFile())
      .filter((file) => file !== null);

    if (props.allowAttachments && files.length > 0) {
      addFiles(files);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (submitOnEnter && event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();

      if (isGenerating && stop && enableInterrupt) {
        if (showInterruptPrompt) {
          stop();
          setShowInterruptPrompt(false);
          event.currentTarget.form?.requestSubmit();
          textAreaRef.current?.blur();
        } else if (
          props.value ||
          (props.allowAttachments && props.files?.length)
        ) {
          setShowInterruptPrompt(true);
          return;
        }
      }

      event.currentTarget.form?.requestSubmit();
      textAreaRef.current?.blur();
    }

    onKeyDownProp?.(event);
  };

  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [textAreaHeight, setTextAreaHeight] = useState<number>(0);

  useEffect(() => {
    if (textAreaRef.current) {
      setTextAreaHeight(textAreaRef.current.offsetHeight);
    }
  }, [props.value, props.allowAttachments ? props.files : null]);

  const showFileList =
    props.allowAttachments && props.files && props.files.length > 0;

  useAutosizeTextArea({
    ref: textAreaRef,
    maxHeight: 240,
    borderWidth: 0,
    dependencies: [props.value, showFileList],
  });

  return (
    <div
      className="relative flex w-full pb-2"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {enableInterrupt && (
        <InterruptPrompt
          isOpen={showInterruptPrompt}
          close={() => setShowInterruptPrompt(false)}
        />
      )}

      <RecordingPrompt
        isVisible={isRecording}
        onStopRecording={stopRecording}
      />

      {/* <AnimatePresence>
        {scrollToBottom &&
          typeof shouldAutoScroll === "boolean" &&
          !isScrolling && // Optional
          !shouldAutoScroll && (
            <motion.div
              key="scroll-to-bottom-btn-wrapper"
              className="absolute left-1/2 -translate-x-1/2"
              initial={{ opacity: 0, y: 10 }}
              animate={{
                opacity: 1,
                y: 0,
                top: isRecording ? -80 : -40,
                transition: {
                  type: "spring",
                  filter: { type: "tween" },
                },
              }}
              exit={{ opacity: 0, y: 10, transition: { duration: 0.2 } }}
            >
              <Button
                type="button"
                onClick={scrollToBottom}
                className="pointer-events-auto h-8 w-8 rounded-full bg-background dark:bg-background shadow-sm"
                size="icon"
                variant="outline"
                aria-label="Scroll to bottom"
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
            </motion.div>
          )}
      </AnimatePresence> */}

      {/* Main Frosted Glass Container */}
      <div className={cn(
        "relative flex flex-col w-full rounded-xl border-2 bg-background/40 backdrop-blur-sm transition-colors overflow-hidden focus-within:border-primary/50"
      )}>
        {/* Text Area Section - including FilePreview inside */}
        <div className="relative pt-1 flex-grow flex flex-col">
          <textarea
            aria-label="Write your prompt here"
            placeholder={placeholder}
            ref={textAreaRef}
            onPaste={onPaste}
            onKeyDown={onKeyDown}
            className={cn(
              "z-10 w-full h-full flex-grow resize-none bg-transparent px-3 py-2 text-base sm:text-[15px] ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
              showFileList && "pb-0",
              className
            )}
            {...(props.allowAttachments
              ? omit(props, ["allowAttachments", "files", "setFiles"])
              : omit(props, ["allowAttachments"]))}
          />

          {props.allowAttachments && props.files && props.files.length > 0 && (
            <div className="overflow-x-auto px-3 py-2 border-t border-input/10">
              <div className="flex space-x-3">
                <AnimatePresence mode="popLayout">
                  {props.files.map((file) => (
                    <FilePreview
                      key={file.name + String(file.lastModified)}
                      file={file}
                      onRemove={() => {
                        props.setFiles((files) => {
                          if (!files) return null;
                          const filtered = Array.from(files).filter(
                            (f) => f !== file
                          );
                          if (filtered.length === 0) return null;
                          return filtered;
                        });
                      }}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>

        {/* Optionally add light border: border-t border-input/20 */}
        <div className="flex items-center justify-between px-2 pb-2 pt-1">
          <div className="flex items-center gap-2">
            {resetChat && (
              <Button
                type="button"
                variant="outline"
                size="xs"
                className="h-8 text-xs font-normal"
                aria-label="Reset Chat"
                onClick={resetChat}
                disabled={isGenerating}
              >
                <Plus className="h-3.5 w-3.5" />
                {/* Ideally don't use media queries such as sm: */}
                <span className="inline sm:hidden">Reset</span>
                <span className="hidden sm:inline">Reset Chat</span>
              </Button>
            )}
          </div>

          <div className="flex items-center gap-1.5 pr-1">
            {props.allowAttachments && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                aria-label="Attach a file"
                onClick={async () => {
                  const files = await showFileUploadDialog();
                  addFiles(files);
                }}
              >
                <Paperclip className="h-4 w-4" />
              </Button>
            )}
            {isSpeechSupported && (
              <Button
                type="button"
                variant="ghost"
                className={cn("h-8 w-8", isListening && "text-primary")}
                aria-label="Voice input"
                size="icon"
                onClick={toggleListening}
              >
                <Mic className="h-4 w-4" />
              </Button>
            )}
            {isGenerating && stop ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                aria-label="Stop generating"
                onClick={stop}
              >
                <Square className="h-3 w-3 animate-pulse" fill="currentColor" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                variant="ghost"
                className="h-8 w-8 transition-opacity text-primary hover:text-primary-focus"
                aria-label="Send message"
                disabled={
                  (props.value === "" &&
                    !(
                      props.allowAttachments &&
                      props.files &&
                      props.files.length > 0
                    )) ||
                  isGenerating
                }
              >
                <ArrowUp className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {props.allowAttachments && <FileUploadOverlay isDragging={isDragging} />}

      <RecordingControls
        isRecording={isRecording}
        isTranscribing={isTranscribing}
        audioStream={audioStream}
        textAreaHeight={textAreaHeight}
        onStopRecording={stopRecording}
      />
    </div>
  );
}
MessageInput.displayName = "MessageInput";

interface FileUploadOverlayProps {
  isDragging: boolean;
}

function FileUploadOverlay({ isDragging }: FileUploadOverlayProps) {
  return (
    <AnimatePresence>
      {isDragging && (
        <motion.div
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center space-x-2 rounded-xl border border-dashed border-border bg-background text-sm text-muted-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          aria-hidden
        >
          <Paperclip className="h-4 w-4" />
          <span>Drop your files here to attach them.</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function showFileUploadDialog() {
  const input = document.createElement("input");

  input.type = "file";
  input.multiple = true;
  input.accept = "*/*";
  input.click();

  return new Promise<File[] | null>((resolve) => {
    input.onchange = (e) => {
      const files = (e.currentTarget as HTMLInputElement).files;

      if (files) {
        resolve(Array.from(files));
        return;
      }

      resolve(null);
    };
  });
}

function TranscribingOverlay() {
  return (
    <motion.div
      className="flex h-full w-full flex-row items-center justify-center gap-2 rounded-xl bg-background/80 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="relative">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <motion.div
          className="absolute inset-0 h-5 w-5 animate-pulse rounded-full bg-primary/20"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1.2, opacity: 1 }}
          transition={{
            duration: 1,
            repeat: Infinity,
            repeatType: "reverse",
            ease: "easeInOut",
          }}
        />
      </div>
      <p className="text-sm font-medium text-muted-foreground">
        Transcribing audio...
      </p>
    </motion.div>
  );
}

interface RecordingPromptProps {
  isVisible: boolean;
  onStopRecording: () => void;
}

function RecordingPrompt({ isVisible, onStopRecording }: RecordingPromptProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ top: 0, filter: "blur(5px)" }}
          animate={{
            top: -40,
            filter: "blur(0px)",
            transition: {
              type: "spring",
              filter: { type: "tween" },
            },
          }}
          exit={{ top: 0, filter: "blur(5px)" }}
          className="absolute left-1/2 flex -translate-x-1/2 cursor-pointer overflow-hidden whitespace-nowrap rounded-full border bg-background py-1 text-center text-sm text-muted-foreground"
          onClick={onStopRecording}
        >
          <span className="mx-2.5 flex items-center">
            <Info className="mr-2 h-3 w-3" />
            Click to finish recording
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface RecordingControlsProps {
  isRecording: boolean;
  isTranscribing: boolean;
  audioStream: MediaStream | null;
  textAreaHeight: number;
  onStopRecording: () => void;
}

function RecordingControls({
  isRecording,
  isTranscribing,
  audioStream,
  textAreaHeight,
  onStopRecording,
}: RecordingControlsProps) {
  if (isRecording || isTranscribing) {
    return (
      <div
        className="absolute inset-0 z-30 overflow-hidden rounded-xl pt-1.5 px-2"
        style={{
          top: 0,
          left: 0,
          right: 0,
          bottom: "auto",
          height: textAreaHeight,
        }}
      >
        {isRecording && (
          <AudioVisualizer
            stream={audioStream}
            isRecording={isRecording}
            onClick={onStopRecording}
          />
        )}
        {isTranscribing && <TranscribingOverlay />}
      </div>
    );
  }
  return null;
}

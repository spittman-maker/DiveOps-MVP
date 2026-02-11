import { useState, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

export function usePTT(onTranscribed: (text: string) => void) {
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];
      setTranscript("");

      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start(100);
      setIsRecording(true);
    } catch (err) {
      const isSecurityError = (err as any)?.name === "NotAllowedError" || (err as any)?.name === "SecurityError";
      const description = isSecurityError
        ? "Microphone access requires HTTPS or browser permission. Check your browser settings and allow microphone access for this site."
        : "Could not access microphone. Please check your browser permissions.";
      toast({ title: "Microphone Error", description, variant: "destructive" });
    }
  }, [toast]);

  const stopRecording = useCallback(async () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") return;

    setIsRecording(false);
    setIsTranscribing(true);

    return new Promise<void>((resolve) => {
      mediaRecorderRef.current!.onstop = async () => {
        streamRef.current?.getTracks().forEach((track) => track.stop());

        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const base64 = await new Promise<string>((res) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            res(result.split(",")[1]);
          };
          reader.readAsDataURL(audioBlob);
        });

        try {
          const response = await fetch("/api/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audio: base64 }),
          });

          if (!response.ok) throw new Error("Transcription failed");

          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          let fullText = "";

          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value);
              const lines = chunk.split("\n").filter((l) => l.startsWith("data:"));

              for (const line of lines) {
                try {
                  const data = JSON.parse(line.replace("data: ", ""));
                  if (data.text) {
                    fullText += data.text;
                    setTranscript(fullText);
                  }
                  if (data.done && fullText.trim()) {
                    onTranscribed(fullText);
                    setTranscript("");
                  }
                } catch {}
              }
            }
          }
        } catch (err) {
          console.error("Transcription error:", err);
          toast({ title: "Transcription Error", description: "Failed to transcribe audio", variant: "destructive" });
        }

        setIsTranscribing(false);
        resolve();
      };

      mediaRecorderRef.current!.stop();
    });
  }, [toast, onTranscribed]);

  return { isRecording, isTranscribing, transcript, startRecording, stopRecording };
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BudgetVoiceInput({
  disabled,
  onFill,
  onBusy,
}: {
  disabled: boolean;
  onFill: (values: {
    amount: string;
    purpose: string;
    fund_id: string;
  }) => void;
  onBusy: (busy: boolean) => void;
}) {
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(true);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");
  const [transcript, setTranscript] = useState("");
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      if (timer.current) clearTimeout(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      recorder.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, []);
  async function start() {
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setMessage(
        "Voice recording is unavailable in this browser. Try Safari or Chrome.",
      );
      return;
    }
    onBusy(true);
    setProcessing(true);
    let stream: MediaStream | undefined;
    setMessage("Allow microphone access to start recording.");
    setTranscript("");
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!active.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const capture = stream;
      const mime = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const instance = new MediaRecorder(
        stream,
        mime ? { mimeType: mime } : undefined,
      );
      recorder.current = instance;
      const chunks: Blob[] = [];
      instance.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      instance.onstop = async () => {
        if (timer.current) clearTimeout(timer.current);
        capture.getTracks().forEach((track) => track.stop());
        if (!active.current) return;
        setRecording(false);
        setMessage("Transcribing and filling the request...");
        setProcessing(true);
        try {
          const audio = new Blob(chunks, { type: instance.mimeType });
          if (audio.size > 10 * 1024 * 1024)
            throw new Error("Recording is too large. Try a shorter message.");
          const data = new FormData();
          const extension = instance.mimeType.includes("mp4")
            ? "mp4"
            : instance.mimeType.includes("ogg")
              ? "ogg"
              : "webm";
          data.set("audio", audio, `request.${extension}`);
          const response = await fetch("/api/requests/voice", {
            method: "POST",
            body: data,
            signal: AbortSignal.timeout(115000),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          if (!active.current) return;
          onFill(result);
          setTranscript(result.transcript);
          setMessage(
            "Voice details filled. Check the fund, amount, and purpose before submitting.",
          );
        } catch (error) {
          if (active.current)
            setMessage(
              error instanceof Error
                ? error.message
                : "Voice input failed. Try again.",
            );
        } finally {
          if (active.current) {
            setProcessing(false);
            onBusy(false);
          }
        }
      };
      instance.start();
      setProcessing(false);
      setRecording(true);
      timer.current = setTimeout(() => {
        if (instance.state === "recording") instance.stop();
      }, 60000);
    } catch {
      stream?.getTracks().forEach((track) => track.stop());
      setProcessing(false);
      setMessage(
        "Microphone access failed. Allow microphone access in your browser and try again.",
      );
      onBusy(false);
    }
  }
  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <p className="text-sm font-medium">Fill using your voice</p>
      <p className="text-xs text-muted-foreground">
        Say the fund, budget amount, and purpose in English or Filipino. Audio
        is sent to Groq for transcription. Recording stops after 60 seconds.
      </p>
      <Button
        type="button"
        variant="outline"
        disabled={disabled || processing}
        onClick={() => (recording ? recorder.current?.stop() : void start())}
      >
        {recording ? <Square /> : <Mic />}
        {recording
          ? "Stop and fill form"
          : processing
            ? "Processing voice..."
            : "Start recording"}
      </Button>
      <p role="status" className="text-sm">
        {recording ? "Listening..." : message}
      </p>
      {transcript && (
        <details className="text-sm">
          <summary className="cursor-pointer">What we heard</summary>
          <p className="mt-2 whitespace-pre-wrap break-words">{transcript}</p>
        </details>
      )}
    </div>
  );
}

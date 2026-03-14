import express, { type Request, type Response } from "express";
import { speechToTextStream, ensureCompatibleFormat } from "../replit_integrations/audio/client";

// ────────────────────────────────────────────────────────────────────────────
// Router — mounted at /api
// ────────────────────────────────────────────────────────────────────────────

export const transcriptionRouter = express.Router();

// ──────────────────────────────────────────────────────────────────────────
// SPEECH-TO-TEXT (PTT Transcription)
// ──────────────────────────────────────────────────────────────────────────

const audioBodyParser = express.json({ limit: "50mb" });

transcriptionRouter.post("/transcribe", audioBodyParser, async (req: Request, res: Response) => {
  try {
    const { audio } = req.body;
    if (!audio) {
      return res.status(400).json({ error: "Audio data (base64) required" });
    }

    const rawBuffer = Buffer.from(audio, "base64");
    const { buffer: audioBuffer, format } = await ensureCompatibleFormat(rawBuffer);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const stream = await speechToTextStream(audioBuffer, format);
    for await (const chunk of stream) {
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error) {
    console.error("Transcription error:", error);
    res.status(500).json({ error: "Transcription failed" });
  }
});

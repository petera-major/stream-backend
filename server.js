const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { OpenAI } = require("openai");
const dotenv = require("dotenv");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const path = require("path");

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: "uploads/" });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const outputDir = "clips";
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

app.post("/api/transcribe", upload.single("video"), async (req, res) => {
  const videoPath = req.file.path;
  const videoName = path.basename(videoPath);
  const outputPaths = [];

  try {
    // transcribe video using Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(videoPath),
      model: "whisper-1"
    });

    const transcriptText = transcription.text;

    // ask GPT-4 to pick clip timestamps
    const gptResponse = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You're a video editor that finds short, engaging clips for TikTok.",
        },
        {
          role: "user",
          content: `Here's the transcript of a video:\n\n"${transcriptText}"\n\nPick exactly 3 exciting, funny, or impactful moments. Reply with only this format:\n[\n  { "start": 42, "duration": 30 },\n  { "start": 130, "duration": 25 },\n  { "start": 300, "duration": 20 }\n]`
        }
      ],
      temperature: 0.7,
    });

    let clipTimes;
    try {
      clipTimes = JSON.parse(gptResponse.choices[0].message.content);
    } catch (err) {
      return res.status(500).json({ 
        error: "GPT returned an unexpected format",
        rawOutput: gptResponse.choices[0].message.content
      });
    }

    // use FFmpeg to create clips
    for (let i = 0; i < clipTimes.length; i++) {
      const outputPath = `${outputDir}/clip_${i + 1}_${videoName}.mp4`;
      await new Promise((resolve, reject) => {
        ffmpeg(videoPath)
          .setStartTime(clipTimes[i].start)
          .duration(clipTimes[i].duration)
          .output(outputPath)
          .on("end", () => {
            outputPaths.push(outputPath);
            resolve();
          })
          .on("error", reject)
          .run();
      });
    }

    res.json({
      transcript: transcriptText,
      clips: outputPaths
    });

  } catch (err) {
    res.status(500).json({ error: "Failed to process video", details: err.message });
  } finally {
    fs.unlinkSync(videoPath);
  }
});

app.listen(4000, () => {
  console.log("🚀 Server running on http://localhost:4000");
});

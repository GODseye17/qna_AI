require("dotenv").config();
const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const pdf = require("pdf-parse");
const cors = require("cors");
const axios = require("axios");

// Initialize Express app
const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors());

// Configure Multer for memory storage (no file system in Vercel)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'), false);
    }
  }
});

// Parse Excel from buffer
function parseExcel(buffer) {
  try {
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    let content = "";
    
    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      content += `Sheet: ${sheetName}\n${xlsx.utils.sheet_to_csv(sheet)}\n\n`;
    });
    
    return content.trim();
  } catch (error) {
    console.error("Error parsing Excel:", error);
    throw new Error("Failed to parse Excel file");
  }
}

// Parse PDF from buffer
async function parsePdf(buffer) {
  try {
    const data = await pdf(buffer);
    if (!data.text || data.text.trim().length === 0) {
      throw new Error("No text content found in PDF");
    }
    return data.text.trim();
  } catch (error) {
    console.error("Error parsing PDF:", error);
    throw new Error("Failed to parse PDF file");
  }
}

// Gemini API call
async function callGeminiAPI(content, question) {
  const API_KEY = process.env.API_KEY || process.env.GEMINI_API_KEY;
  
  if (!API_KEY) {
    throw new Error("Gemini API key is not configured");
  }

  const maxContentLength = 30000;
  const truncatedContent = content.length > maxContentLength 
    ? content.substring(0, maxContentLength) + "... [content truncated]"
    : content;

  const prompt = `Based on the following document content, please answer the question accurately.

Document Content:
${truncatedContent}

Question: ${question}

Answer:`;

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
      {
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        }
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );

    if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      return response.data.candidates[0].content.parts[0].text;
    } else {
      throw new Error("Invalid response from Gemini API");
    }
  } catch (error) {
    console.error("Gemini API Error:", error.message);
    throw new Error("Failed to get AI response");
  }
}

// Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Upload endpoint - process file in memory
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    console.log(`Processing file: ${req.file.originalname}`);
    let content = "";

    // Process file from buffer (memory)
    if (req.file.mimetype === "application/pdf") {
      content = await parsePdf(req.file.buffer);
    } else {
      content = parseExcel(req.file.buffer);
    }

    if (!content || content.trim().length === 0) {
      throw new Error("No content extracted from file");
    }

    res.json({
      success: true,
      content: content,
      metadata: {
        originalName: req.file.originalname,
        size: req.file.size
      }
    });

  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({
      error: "Failed to process file",
      message: error.message
    });
  }
});

// Ask endpoint
app.post("/api/ask", async (req, res) => {
  try {
    const { content, question } = req.body;

    if (!content || !question) {
      return res.status(400).json({
        error: "Missing content or question"
      });
    }

    const answer = await callGeminiAPI(content, question);

    res.json({
      success: true,
      answer: answer
    });

  } catch (error) {
    console.error("Ask error:", error);
    res.status(500).json({
      error: "Failed to generate response",
      message: error.message
    });
  }
});

// For Vercel serverless
module.exports = app;
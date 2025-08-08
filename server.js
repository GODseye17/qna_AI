require("dotenv").config();
const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const pdf = require("pdf-parse");
const fs = require("fs").promises;
const path = require("path");
const cors = require("cors");
const axios = require("axios");

// Initialize Express app
const app = express();

// Constants
const PORT = process.env.PORT || 5001;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
];

// Middleware Configuration
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS Configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5001',
      'https://aichat-gemini.vercel.app',
      'https://your-domain.com'
    ];
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));

// Serve static files from public directory
const publicPath = path.resolve(__dirname, "public");
app.use(express.static(publicPath));

// Create uploads directory if it doesn't exist
const uploadDir = path.resolve(__dirname, "uploads");
(async () => {
  try {
    await fs.access(uploadDir);
  } catch {
    await fs.mkdir(uploadDir, { recursive: true });
    console.log("📁 Created uploads directory");
  }
})();

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: MAX_FILE_SIZE
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF and Excel files are allowed.'), false);
    }
  }
});

// Utility Functions

/**
 * Parse Excel file and extract text content
 * @param {string} filePath - Path to the Excel file
 * @returns {Promise<string>} - Extracted text content
 */
async function parseExcel(filePath) {
  try {
    const fileBuffer = await fs.readFile(filePath);
    const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
    
    let content = "";
    const sheetNames = workbook.SheetNames;
    
    sheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const sheetContent = xlsx.utils.sheet_to_csv(sheet);
      content += `Sheet: ${sheetName}\n${sheetContent}\n\n`;
    });
    
    return content.trim();
  } catch (error) {
    console.error("Error parsing Excel file:", error);
    throw new Error("Failed to parse Excel file. Please ensure it's a valid file.");
  }
}

/**
 * Parse PDF file and extract text content
 * @param {string} filePath - Path to the PDF file
 * @returns {Promise<string>} - Extracted text content
 */
async function parsePdf(filePath) {
  try {
    const dataBuffer = await fs.readFile(filePath);
    const data = await pdf(dataBuffer);
    
    if (!data.text || data.text.trim().length === 0) {
      throw new Error("No text content found in PDF");
    }
    
    return data.text.trim();
  } catch (error) {
    console.error("Error parsing PDF file:", error);
    throw new Error("Failed to parse PDF file. Please ensure it contains readable text.");
  }
}

/**
 * Clean up uploaded file
 * @param {string} filePath - Path to the file to delete
 */
async function cleanupFile(filePath) {
  try {
    await fs.unlink(filePath);
    console.log("🗑️  Cleaned up temporary file:", filePath);
  } catch (error) {
    console.error("Error deleting file:", error);
  }
}

/**
 * Call Google Gemini API
 * @param {string} content - Document content
 * @param {string} question - User question
 * @returns {Promise<string>} - AI response
 */
async function callGeminiAPI(content, question) {
  const API_KEY = process.env.API_KEY || process.env.GEMINI_API_KEY;
  
  if (!API_KEY) {
    throw new Error("Gemini API key is not configured");
  }

  // Truncate content if it's too long (Gemini has token limits)
  const maxContentLength = 30000;
  const truncatedContent = content.length > maxContentLength 
    ? content.substring(0, maxContentLength) + "... [content truncated]"
    : content;

  const prompt = `Based on the following document content, please answer the question accurately and concisely.

Document Content:
${truncatedContent}

Question: ${question}

Please provide a clear and helpful answer based on the information in the document. If the answer cannot be found in the document, please state that clearly.`;

  try {
    console.log("🔄 Calling Gemini API...");
    
    // Updated to use gemini-1.5-flash which is the current available model
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
      {
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048,
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000,
        validateStatus: function (status) {
          return status < 500;
        }
      }
    );

    console.log("📡 API Response Status:", response.status);

    // Check for API errors
    if (response.status !== 200) {
      console.error("API Error Response:", response.data);
      
      if (response.status === 400) {
        throw new Error("Invalid API request. Please check your API key.");
      } else if (response.status === 403) {
        throw new Error("API key is invalid or doesn't have proper permissions.");
      } else if (response.status === 404) {
        throw new Error("Model not found. Please contact support.");
      } else if (response.status === 429) {
        throw new Error("API rate limit exceeded. Please try again later.");
      } else {
        throw new Error(`API returned error: ${response.status}`);
      }
    }

    // Extract the response text
    if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      const answer = response.data.candidates[0].content.parts[0].text;
      console.log("✅ Successfully got AI response");
      return answer;
    } else if (response.data?.error) {
      console.error("API Error:", response.data.error);
      throw new Error(response.data.error.message || "API returned an error");
    } else {
      console.error("Unexpected response structure:", response.data);
      throw new Error("Invalid response structure from Gemini API");
    }

  } catch (error) {
    console.error("Gemini API Error Details:", {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      code: error.code
    });
    
    // Throw appropriate error messages
    if (error.message) {
      throw error;
    } else {
      throw new Error("Failed to get response from AI. Please try again.");
    }
  }
}

// API Routes

/**
 * Health check endpoint
 */
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development"
  });
});

/**
 * File upload endpoint
 */
app.post("/upload", upload.single("file"), async (req, res) => {
  let filePath = null;

  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        error: "No file uploaded",
        message: "Please select a file to upload"
      });
    }

    filePath = req.file.path;
    console.log(`📄 Processing file: ${req.file.originalname}`);

    let content = "";

    // Process based on file type
    if (req.file.mimetype === "application/pdf") {
      content = await parsePdf(filePath);
    } else if (
      req.file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      req.file.mimetype === "application/vnd.ms-excel"
    ) {
      content = await parseExcel(filePath);
    } else {
      throw new Error("Unsupported file type");
    }

    // Validate content
    if (!content || content.trim().length === 0) {
      throw new Error("No content could be extracted from the file");
    }

    // Clean up the uploaded file
    await cleanupFile(filePath);

    // Send success response
    res.json({
      success: true,
      content: content,
      metadata: {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        contentLength: content.length
      }
    });

  } catch (error) {
    // Clean up file if it exists
    if (filePath) {
      await cleanupFile(filePath);
    }

    console.error("Upload error:", error);

    // Send error response
    res.status(500).json({
      error: "Failed to process file",
      message: error.message || "An unexpected error occurred",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
});

/**
 * AI question answering endpoint
 */
app.post("/api/ask", async (req, res) => {
  try {
    const { content, question } = req.body;

    // Validate input
    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        error: "Missing content",
        message: "Please upload a document first"
      });
    }

    if (!question || question.trim().length === 0) {
      return res.status(400).json({
        error: "Missing question",
        message: "Please provide a question"
      });
    }

    // Validate question length
    if (question.length > 500) {
      return res.status(400).json({
        error: "Question too long",
        message: "Please keep your question under 500 characters"
      });
    }

    console.log(`🤖 Processing question: ${question.substring(0, 50)}...`);

    // Call Gemini API
    const answer = await callGeminiAPI(content, question);

    // Send success response
    res.json({
      success: true,
      answer: answer,
      metadata: {
        questionLength: question.length,
        responseLength: answer.length,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error("AI API error:", error);

    // Determine status code based on error
    let statusCode = 500;
    if (error.message.includes("rate limit")) {
      statusCode = 429;
    } else if (error.message.includes("API key")) {
      statusCode = 403;
    }

    // Send error response
    res.status(statusCode).json({
      error: "Failed to generate response",
      message: error.message || "An unexpected error occurred",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
});

/**
 * Get server statistics
 */
app.get("/api/stats", (req, res) => {
  const stats = {
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    platform: process.platform,
    nodeVersion: process.version,
    timestamp: new Date().toISOString()
  };

  res.json(stats);
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Global error handler:", error);

  // Handle multer errors
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: "File too large",
        message: "File size must be less than 10MB"
      });
    }
  }

  // Default error response
  res.status(500).json({
    error: "Internal server error",
    message: error.message || "An unexpected error occurred",
    details: process.env.NODE_ENV === "development" ? error.stack : undefined
  });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: "Not found",
    message: "The requested API endpoint does not exist"
  });
});

// Serve index.html for all other routes (SPA support)
app.get("*", (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════╗
║                                                   ║
║   🚀 AI Document Q&A Server                      ║
║                                                   ║
║   Status: Running                                 ║
║   Port: ${PORT}                                      ║
║   URL: http://localhost:${PORT}                      ║
║   Environment: ${process.env.NODE_ENV || 'development'}                  ║
║                                                   ║
║   Created by: Yash Shankaram                     ║
║   Institution: Manipal Institute of Technology   ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

async function shutdown() {
  console.log('\n📴 Shutting down gracefully...');
  
  // Clean up any remaining files in uploads directory
  try {
    const files = await fs.readdir(uploadDir);
    for (const file of files) {
      await fs.unlink(path.join(uploadDir, file));
    }
    console.log('✅ Cleaned up temporary files');
  } catch (error) {
    console.error('Error during cleanup:', error);
  }

  process.exit(0);
}

module.exports = app;
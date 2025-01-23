require("dotenv").config(); 
const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const pdf = require("pdf-parse");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const { google } = require("googleapis"); 

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();

// Middleware to parse JSON requests
app.use(express.json());

// Enable CORS for all routes
app.use(cors());

// Serve static files from the frontend directory
const frontendPath = path.resolve(__dirname, "../public");
app.use(express.static(frontendPath));

// Directory for file uploads
const uploadDir = path.resolve(__dirname, "uploads");

// Ensure the uploads directory exists
if (!fs.existsSync(uploadDir)) {
  try {
    fs.mkdirSync(uploadDir, { recursive: true }); // Ensure parent directories are created if needed
  } catch (error) {
    console.error(`Error creating uploads directory at ${uploadDir}:`, error.message);
    throw new Error("Failed to initialize the uploads directory.");
  }
}

// Configure Multer for handling file uploads
const upload = multer({ dest: uploadDir });

module.exports = { app, upload };



const xlsx = require("xlsx");

function parseExcel(buffer) {
  const workbook = xlsx.read(buffer,{type:'buffer'});
  const sheetNames = workbook.SheetNames;
  let content = "";
  sheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    content += xlsx.utils.sheet_to_csv(sheet) + "\n";
  });
  return content;
}


const fs = require("fs").promises;
const pdf = require("pdf-parse");

async function parsePdf(filePath) {
  try {
    // Read the file asynchronously to avoid blocking the event loop
    const dataBuffer = await fs.readFile(filePath);

    // Parse the PDF content
    const { text } = await pdf(dataBuffer);

    // Return the extracted text
    return text;
  } catch (error) {
    // Log and rethrow the error for better debugging
    console.error(`Error parsing PDF at ${filePath}:`, error.message);
    throw new Error("Failed to parse the PDF file. Please ensure it is a valid file.");
  }
}



app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    
    const supportedMimeTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];

    if (!supportedMimeTypes.includes(file.mimetype)) {
      
      fs.unlinkSync(file.path);
      return res.status(400).json({ error: "Unsupported file type" });
    }

    let content = "";
    if (file.mimetype === "application/pdf") {
      content = await parsePdf(file.path);
    } else if (
      file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.mimetype === "application/vnd.ms-excel"
    ) {
      content = parseExcel(file.path);
    }

    fs.unlinkSync(file.path);

    
    res.json({ content });
  } catch (error) {
    console.error("Error processing file:", error.message);
    res.status(500).json({ error: "Failed to process the file" });
  }
});


const axios = require("axios");

app.post("/api/ask", async (req, res) => {
  const { content, question } = req.body;
  const API_KEY = process.env.GEMINI_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({ error: "API key is not configured" });
  }

  if (!content || !question) {
    return res.status(400).json({ error: "Missing content or question" });
  }

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${API_KEY}`,
      {
        contents: [`Context: ${content}\n\nQuestion: ${question}`],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 256,
        },
      }
    );

    // Validate and return the response
    if (response.data && response.data.generatedText) {
      return res.status(200).json({ answer: response.data.generatedText });
    } else {
      return res.status(500).json({ error: "Invalid response from API" });
    }
  } catch (error) {
    // Handle API call errors
    console.error("Error calling the Gemini API:", error.response?.data || error.message);
    return res.status(500).json({
      error: "Failed to generate a response from the Gemini API",
      details: error.response?.data || error.message,
    });
  }
});


    
    const express = require('express');
    const router = express.Router();
    
    router.post('/ai-query', async (req, res) => {
      try {
        const response = await queryGeminiAPI(req.body); // Assume queryGeminiAPI is the function making the API call
        const aiAnswer = response?.data?.predictions?.[0]?.content?.trim();
    
        if (!aiAnswer) {
          throw new Error("AI response is empty or invalid.");
        }
    
        res.status(200).json({ answer: aiAnswer });
      } catch (error) {
        const errorMessage = error.response?.data || error.message || "Unknown error occurred.";
        console.error("Error while querying Gemini API:", errorMessage);
    
        res.status(500).json({
          error: "Failed to process the request with Gemini API.",
          details: errorMessage, // Include details for debugging purposes
        });
      }
    });
    
    module.exports = router;
    


app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});


const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

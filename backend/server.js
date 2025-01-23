require("dotenv").config(); // Load environment variables
const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const pdf = require("pdf-parse");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const { google } = require("googleapis"); // Google API SDK

const app = express();
app.use(express.json());
app.use(cors()); // Enable CORS for all origins

// Serve static files (frontend)
const frontendPath = path.join(__dirname, "../public");
app.use(express.static(frontendPath));

// Configure Multer for file uploads
const upload = multer({ dest: path.join(__dirname, "uploads/") }); // Ensure the "uploads" directory exists

// Ensure the uploads directory exists
if (!fs.existsSync(path.join(__dirname, "uploads"))) {
  fs.mkdirSync(path.join(__dirname, "uploads"));
}

// Function to parse Excel files
function parseExcel(filePath) {
  const workbook = xlsx.readFile(filePath);
  const sheetNames = workbook.SheetNames;
  let content = "";
  sheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    content += xlsx.utils.sheet_to_csv(sheet) + "\n";
  });
  return content;
}

// Function to parse PDF files
async function parsePdf(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdf(dataBuffer);
  return data.text;
}

// Route to upload and process files
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Supported MIME types
    const supportedMimeTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];

    if (!supportedMimeTypes.includes(file.mimetype)) {
      // Cleanup uploaded file if it's not supported
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

    // Cleanup uploaded file
    fs.unlinkSync(file.path);

    // Respond with parsed content
    res.json({ content });
  } catch (error) {
    console.error("Error processing file:", error.message);
    res.status(500).json({ error: "Failed to process the file" });
  }
});

// Google Gemini API Integration
app.post("/ask", async (req, res) => {
  const { content, question } = req.body;

  if (!content || !question) {
    return res.status(400).json({ error: "Missing content or question" });
  }

  try {
    const auth = new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });

    const authClient = await auth.getClient();
    const projectId = await auth.getProjectId();
    const endpoint = `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/text-bison:predict`;

    const response = await google.auth.request({
      url: endpoint,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        instances: [
          {
            content: `Context: ${content}\n\nQuestion: ${question}`,
          },
        ],
        parameters: {
          temperature: 0.7,
          maxOutputTokens: 256,
        },
      }),
    });

    const aiAnswer = response.data.predictions[0].content.trim();
    res.json({ answer: aiAnswer });
  } catch (error) {
    console.error("Error querying Gemini:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to get Gemini API response." });
  }
});

// Fallback to serve `index.html` for any unknown route
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// Start the server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

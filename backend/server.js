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

function parseExcel(filePath) {
  try {
    // Read the workbook from the file
    const workbook = xlsx.readFile(filePath);

    // Get all sheet names in the workbook
    const sheetNames = workbook.SheetNames;

    // Extract data from each sheet and convert to CSV format
    const content = sheetNames
      .map((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        return xlsx.utils.sheet_to_csv(sheet); // Convert each sheet to CSV
      })
      .join("\n"); // Join all CSV content with a newline

    // Return the consolidated content
    return content;
  } catch (error) {
    // Log and rethrow the error for better debugging
    console.error(`Error parsing Excel file at ${filePath}:`, error.message);
    throw new Error("Failed to parse the Excel file. Please ensure it is a valid file.");
  }
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


app.post("/ask", async (req, res) => {
  // Extract content and question from the request body
  const { content, question } = req.body;

  // Validate inputs
  if (!content || !question) {
    return res.status(400).json({ error: "Please provide both content and a question." });
  }

  try {
    
    const auth = new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });

   
    const authClient = await auth.getClient();
    const projectId = await auth.getProjectId();

    
    const endpoint = `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/text-bison:predict`;

   
    const response = await authClient.request({
      url: endpoint,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        instances: [
          {
            content: `Context: ${content}\n\nQuestion: ${question}`,
          },
        ],
        parameters: {
          temperature: 0.7,
          maxOutputTokens: 256,
        },
      },
    });

    
    const aiAnswer = response.data.predictions[0].content.trim();
    res.status(200).json({ answer: aiAnswer });
  } catch (error) {
    console.error("Error while querying Gemini API:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to process the request with Gemini API." });
  }
});


    const aiAnswer = response.data.predictions[0].content.trim();
    res.json({ answer: aiAnswer });
  } catch (error) {
    console.error("Error querying Gemini:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to get Gemini API response." });
  }
});


app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});


const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

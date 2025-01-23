require("dotenv").config(); // To load environment variables
const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const pdf = require("pdf-parse");
const axios = require("axios");
const cors = require("cors");
const fs = require("fs");

const app = express();
app.use(express.json());
app.use(cors());

// Configure Multer for file uploads
const upload = multer({ dest: "uploads/" });

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

// Upload and process files
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    let content = "";
    if (file.mimetype === "application/pdf") {
      content = await parsePdf(file.path);
    } else if (
      file.mimetype ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.mimetype === "application/vnd.ms-excel"
    ) {
      content = parseExcel(file.path);
    } else {
      return res.status(400).json({ error: "Unsupported file type" });
    }

    // Cleanup uploaded file
    fs.unlinkSync(file.path);

    // Respond with parsed content
    res.json({ content });
  } catch (error) {
    console.error("Error processing file:", error);
    res.status(500).json({ error: "Failed to process the file" });
  }
});

// AI Integration with Hugging Face
// AI Integration with Hugging Face
app.post("/ask", async (req, res) => {
  const { content, question } = req.body;

  if (!content || !question) {
    return res.status(400).json({ error: "Missing content or question" });
  }

  try {
    // Q&A Model Input
    const payload = {
      inputs: {
        question: question, // The user's question
        context: content,   // The document content
      },
    };

    // Make a request to Hugging Face's Inference API
    const response = await axios.post(
      "https://api-inference.huggingface.co/models/deepset/roberta-base-squad2",
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
        },
      }
    );

    // Extract the AI's answer from the response
    const aiAnswer = response.data.answer || "No response from the model.";
    res.json({ answer: aiAnswer });
  } catch (error) {
    console.error("Error querying AI:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to get AI response." });
  }
});


// Start the server
const PORT = 5001;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${5001}`);
});

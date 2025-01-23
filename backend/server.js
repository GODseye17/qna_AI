require("dotenv").config(); 
const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const pdf = require("pdf-parse");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const { google } = require("googleapis"); 

const app = express();
app.use(express.json());
app.use(cors()); 


const frontendPath = path.join(__dirname, "../public");
app.use(express.static(frontendPath));


const upload = multer({ dest: path.join(__dirname, "uploads/") }); 


if (!fs.existsSync(path.join(__dirname, "uploads"))) {
  fs.mkdirSync(path.join(__dirname, "uploads"));
}


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


async function parsePdf(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdf(dataBuffer);
  return data.text;
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

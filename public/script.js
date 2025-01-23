const API_URL = "http://localhost:5001"; // Backend server URL

// Function to handle file upload
async function uploadFile() {
  const fileInput = document.getElementById("fileInput");
  const file = fileInput.files[0];

  if (!file) {
    alert("Please select a file to upload.");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await fetch(`${API_URL}/upload`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      alert(errorData.error || "Failed to process the file.");
      return;
    }

    const data = await response.json();
    if (data.content) {
      displayContent(data.content);
    } else {
      alert("No content was extracted from the file.");
    }
  } catch (error) {
    console.error("Error uploading file:", error.message);
    alert("An error occurred while uploading the file. Please try again.");
  }
}

// Function to display the extracted content in the chat container
function displayContent(content) {
  const chatContainer = document.getElementById("chatContainer");
  chatContainer.innerHTML = ""; // Clear previous content

  const contentMessage = document.createElement("div");
  contentMessage.className = "chat-message extracted-content";
  contentMessage.innerText = content;
  chatContainer.appendChild(contentMessage);
}

// Function to handle asking the Gemini AI
async function askAI() {
  const questionInput = document.getElementById("questionInput");
  const question = questionInput.value.trim();

  if (!question) {
    alert("Please enter a question.");
    return;
  }

  // Ensure extracted content is available
  const content = document.querySelector(".extracted-content")?.innerText || "";
  if (!content) {
    alert("Please upload and process a document first.");
    return;
  }

  try {
    const response = await fetch(`${API_URL}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, question }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      alert(errorData.error || "Failed to get Gemini API response.");
      return;
    }

    const data = await response.json();
    displayChatMessage("user", `Q: ${question}`);
    displayChatMessage("ai", `A: ${data.answer || "No response from AI."}`);
  } catch (error) {
    console.error("Error asking AI:", error.message);
    alert("An error occurred while asking the AI. Please try again.");
  }

  questionInput.value = ""; // Clear the input field
}

// Utility function to display messages in the chat container
function displayChatMessage(sender, message) {
  const chatContainer = document.getElementById("chatContainer");

  const messageDiv = document.createElement("div");
  messageDiv.className = `chat-message ${sender === "user" ? "user-message" : "ai-message"}`;
  messageDiv.innerText = message;

  chatContainer.appendChild(messageDiv);

  // Scroll to the bottom of the chat container
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

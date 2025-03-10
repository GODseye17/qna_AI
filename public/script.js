const API_URL = "https://aichat-gemini.vercel.app/";


async function uploadFile() {
  const fileInput = document.getElementById("fileInput");
  const file = fileInput?.files?.[0]; 

  if (!file) {
    alert("Please select a file to upload.");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);

  try {
    
    showLoading(true);

    const response = await fetch(`${API_URL}/upload`, {
      method: "POST",
      body: formData,
    });

   
    if (!response.ok) {
      const errorData = await response.json();
      console.error("Upload error:", errorData);
      alert(errorData.error || "Failed to process the file. Please try again.");
      return;
    }

    const data = await response.json();

    
    if (data?.content) {
      displayContent(data.content);
    } else {
      alert("No content was extracted from the file.");
    }
  } catch (error) {
    
    console.error("Error uploading file:", error);
    alert("An error occurred while uploading the file. Please check your connection and try again.");
  } finally {
    
    showLoading(false);
  }
}

/**

 * @param {string} content 
 */
function displayContent(content) {
  const contentDisplay = document.getElementById("contentDisplay");

  
  if (!contentDisplay) {
    console.warn("Content display element not found.");
    alert("The file was processed, but the content could not be displayed.");
    return;
  }

  
  contentDisplay.textContent = "";

  
  const contentContainer = document.createElement("div");
  contentContainer.className = "content-container";
  contentContainer.textContent = content;

  
  contentDisplay.appendChild(contentContainer);

 
  contentDisplay.scrollTop = 0;
}


/**
 
 * @param {boolean} isLoading 
 */
function showLoading(isLoading) {
  const loadingIndicator = document.getElementById("loadingIndicator");
  if (loadingIndicator) {
    loadingIndicator.style.display = isLoading ? "block" : "none";
  }
}



function displayContent(content) {
  const chatContainer = document.getElementById("chatContainer");

  if (!chatContainer) {
    console.error("Chat container element not found.");
    alert("Unable to display the content. Chat container is missing.");
    return;
  }

  
  chatContainer.innerHTML = "";

  const contentMessage = document.createElement("div");
  contentMessage.className = "chat-message extracted-content";
  contentMessage.textContent = content; 

  // Add a timestamp for context
  const timestamp = document.createElement("div");
  timestamp.className = "timestamp";
  timestamp.textContent = `Extracted on: ${new Date().toLocaleString()}`;

  // Append message and timestamp to the chat container
  chatContainer.appendChild(contentMessage);
  chatContainer.appendChild(timestamp);

  // Scroll to the bottom of the chat container
  chatContainer.scrollTop = chatContainer.scrollHeight;
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

  // Check if the chat container exists
  if (!chatContainer) {
    console.error("Chat container element not found.");
    alert("Unable to display the chat message. Chat container is missing.");
    return;
  }

  // Create a wrapper for the chat message
  const messageWrapper = document.createElement("div");
  messageWrapper.className = `chat-message-wrapper ${sender === "user" ? "user-wrapper" : "ai-wrapper"}`;

  // Create the message content element
  const messageDiv = document.createElement("div");
  messageDiv.className = `chat-message ${sender === "user" ? "user-message" : "ai-message"}`;
  messageDiv.textContent = message; // Use textContent for security

  // Add a timestamp for each message
  const timestamp = document.createElement("div");
  timestamp.className = "message-timestamp";
  timestamp.textContent = new Date().toLocaleTimeString();

  // Append the message and timestamp to the wrapper
  messageWrapper.appendChild(messageDiv);
  messageWrapper.appendChild(timestamp);

  // Append the wrapper to the chat container
  chatContainer.appendChild(messageWrapper);

  // Scroll to the bottom of the chat container
  chatContainer.scrollTop = chatContainer.scrollHeight;
}


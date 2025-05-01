// chat.js

let socket;
let currentRoomId = null;

// Format a timestamp into a readable format
function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const formattedHours = hours % 12 || 12;
  const formattedMinutes = minutes.toString().padStart(2, "0");
  return `${formattedHours}:${formattedMinutes} ${ampm}`;
}

// Redirect unauthorized users from the chat page
(async function checkAuthenticationAndConnect() {
  try {
    const response = await fetch("http://192.168.1.212:3003/verifyToken", {
      method: "GET",
      credentials: "include",
    });

    if (!response.ok) {
      window.location.href = "http://192.168.1.212:3000/login.html";
      return;
    }

    const userData = await response.json();
    connectSocket(userData.userId);
  } catch (error) {
    console.error("Error verifying authentication:", error);
    window.location.href = "http://192.168.1.212:3000/login.html";
  }
})();

// Establish a WebSocket connection
function connectSocket(userId) {
  const token = document.cookie
    .split("; ")
    .find((row) => row.startsWith("auth_token="))
    ?.split("=")[1];

  if (!token) {
    alert("You are not authenticated. Please log in first!");
    window.location.href = "http://192.168.1.212:3000/login.html";
    return;
  }

  socket = io("http://192.168.1.212:3003", {
    auth: { token },
  });

  socket.on("connect", () => {
    socket.emit("registerUser", userId);
  });

  socket.on("userDetails", (userDetails) => {
    console.log("User details:", userDetails);
    socket.user = userDetails;
    updateConnectionUI(true, userDetails);
  });

  socket.on("disconnect", () => {
    alert("You have been disconnected.");
    updateConnectionUI(false);
  });

  socket.on("receiveMessage", (message) => {
    if (message.roomId === currentRoomId) {
      const isSent = message.senderId === socket.user.id;
      renderMessage(message, isSent);
    } else {
      console.log("Message received for a different room. Ignoring.");
    }
  });
}

// Update the UI based on connection status
function updateConnectionUI(isConnected, user = null) {
  const connectionIndicator = document.getElementById("connectionIndicator");
  const connectionStatus = document.getElementById("connectionStatus");
  const userInfoSection = document.getElementById("userInfoSection");
  const userAvatar = document.getElementById("userAvatar");
  const currentUserId = document.getElementById("currentUserId");
  const messageInput = document.getElementById("messageInput");
  const sendButton = document.getElementById("sendButton");

  if (isConnected && user) {
    connectionIndicator.classList.add("connected");
    connectionStatus.textContent = "Connected";
    userInfoSection.style.display = "flex";
    // Set avatar initials based on userId
    userAvatar.textContent = user.username.substring(0, 2).toUpperCase();
    currentUserId.textContent = user.id;

    // Enable message input and send button once connected
    messageInput.disabled = false;
    sendButton.disabled = false;
  } else {
    connectionIndicator.classList.remove("connected");
    connectionStatus.textContent = "Disconnected";
    userInfoSection.style.display = "none";

    // Disable message input and send button when disconnected
    messageInput.disabled = true;
    sendButton.disabled = true;
  }
}

// Start a new conversation or get an existing one
function startConversation() {
  const receiverId = document.getElementById("receiverId").value;

  if (!receiverId) {
    alert("Please enter a Receiver's User ID!");
    return;
  }

  if (!socket) {
    alert("You are not connected to the server. Please connect first!");
    return;
  }

  // Show loading indicator
  const loadingIndicator = document.getElementById("loadingIndicator");
  loadingIndicator.style.display = "flex";

  socket.emit("startConversation", { recipientId: receiverId }, (response) => {
    // Hide loading indicator
    loadingIndicator.style.display = "none";

    if (response.success) {
      currentRoomId = response.roomId;
      document.getElementById("chatWindow").innerHTML = "";

      // Add no messages indicator
      const noMessagesIndicator = document.createElement("div");
      noMessagesIndicator.id = "noMessagesIndicator";
      noMessagesIndicator.className = "no-messages";
      noMessagesIndicator.innerHTML = `
        <i class="fas fa-comments" style="font-size: 24px; margin-bottom: 12px; color: #c1c9d7"></i>
        <div>No messages yet with ${
          response.recipient.username || receiverId
        }</div>
      `;
      document.getElementById("chatWindow").appendChild(noMessagesIndicator);

      // Enable message input and send button
      document.getElementById("messageInput").disabled = false;
      document.getElementById("sendButton").disabled = false;

      loadMessages(currentRoomId);
    } else {
      alert(`Error: ${response.error}`);
    }
  });
}

// Send a message
function sendMessage() {
  if (!socket) {
    alert("You are not connected to the server. Please connect first!");
    return;
  }

  const messageInput = document.getElementById("messageInput");
  const content = messageInput.value.trim();

  if (!content) {
    return;
  }

  if (!currentRoomId) {
    alert("Please start a conversation first!");
    return;
  }

  const message = {
    roomId: currentRoomId,
    content: content,
  };

  // Clear input immediately for better UX
  messageInput.value = "";

  // Focus back on input
  messageInput.focus();

  socket.emit("sendMessage", message, (response) => {
    if (response.error) {
      alert(`Error sending message: ${response.error}`);
      // Put the message back in the input if it failed
      messageInput.value = content;
      return;
    }
  });
}

// Load message history
function loadMessages(roomId, page = 1, limit = 20) {
  if (!socket) {
    alert("You are not connected to the server. Please connect first!");
    return;
  }

  // Show loading indicator
  const loadingIndicator = document.getElementById("loadingIndicator");
  loadingIndicator.style.display = "flex";

  socket.emit("loadMessages", { roomId, page, limit }, (response) => {
    // Hide loading indicator
    loadingIndicator.style.display = "none";

    if (response.success) {
      const chatWindow = document.getElementById("chatWindow");
      chatWindow.innerHTML = "";

      if (response.messages.length === 0) {
        const noMessagesIndicator = document.createElement("div");
        noMessagesIndicator.className = "no-messages";
        noMessagesIndicator.id = "noMessagesIndicator";
        noMessagesIndicator.innerHTML = `
          <i class="fas fa-comments" style="font-size: 24px; margin-bottom: 12px; color: #c1c9d7"></i>
          <div>No messages in this conversation yet</div>
        `;
        chatWindow.appendChild(noMessagesIndicator);
        return;
      }

      response.messages.forEach((message) => {
        const isSent = message.senderId === socket.user.id;
        renderMessage(message, isSent);
      });

      chatWindow.scrollTop = chatWindow.scrollHeight;
    } else {
      alert(`Error loading messages: ${response.error}`);
    }
  });
}

// Mark messages as read
function markMessagesAsRead() {
  if (!socket || !currentRoomId) {
    return;
  }

  socket.emit("markAsRead", { roomId: currentRoomId }, (response) => {
    if (response.success) {
      console.log("Messages marked as read:", response.messagesRead);
    } else {
      console.error("Error marking messages as read:", response.error);
    }
  });
}

// Render a message in the chat window
function renderMessage(message, isSent) {
  const chatWindow = document.getElementById("chatWindow");
  const noMessagesIndicator = document.getElementById("noMessagesIndicator");

  if (noMessagesIndicator) {
    noMessagesIndicator.style.display = "none";
  }

  const messageElement = document.createElement("div");
  messageElement.className = `message message-${isSent ? "sent" : "received"}`;

  // Format message content
  const contentText = message.content;

  // Add timestamp
  const timeElement = document.createElement("span");
  timeElement.className = "message-time";
  timeElement.textContent = formatTimestamp(message.createdAt || new Date());

  // Set the inner HTML of the message
  messageElement.textContent = contentText;
  messageElement.appendChild(timeElement);

  chatWindow.appendChild(messageElement);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// Attach event listeners
document.addEventListener("DOMContentLoaded", () => {
  document
    .getElementById("confirmButton")
    .addEventListener("click", startConversation);
  document.getElementById("sendButton").addEventListener("click", sendMessage);

  // Submit message on Enter key
  document
    .getElementById("messageInput")
    .addEventListener("keypress", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        sendMessage();
      }
    });

  // Submit receiver ID on Enter key
  document
    .getElementById("receiverId")
    .addEventListener("keypress", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        startConversation();
      }
    });

  // Mark messages as read when scrolling chat window
  document
    .getElementById("chatWindow")
    .addEventListener("scroll", markMessagesAsRead);
});

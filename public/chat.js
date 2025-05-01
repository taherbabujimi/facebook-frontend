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
    socket.user = userDetails;
    updateConnectionUI(true, userDetails.id);
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
function updateConnectionUI(isConnected, userId = null) {
  const connectionIndicator = document.getElementById("connectionIndicator");
  const connectionStatus = document.getElementById("connectionStatus");
  const userInfoSection = document.getElementById("userInfoSection");
  // const userAvatar = document.getElementById("userAvatar");
  const currentUserId = document.getElementById("currentUserId");

  if (isConnected && userId) {
    connectionIndicator.classList.add("connected");
    connectionStatus.textContent = "Connected";
    userInfoSection.style.display = "flex";
    // userAvatar.textContent = userId.substring(0, 2).toUpperCase();
    currentUserId.textContent = userId;
  } else {
    connectionIndicator.classList.remove("connected");
    connectionStatus.textContent = "Disconnected";
    userInfoSection.style.display = "none";
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

  socket.emit("startConversation", { recipientId: receiverId }, (response) => {
    if (response.success) {
      alert(`Conversation started with ${response.recipient.username}`);
      currentRoomId = response.roomId;
      document.getElementById("chatWindow").innerHTML = "";
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

  const content = document.getElementById("messageInput").value;

  if (!content) {
    alert("Please enter a message!");
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

  socket.emit("sendMessage", message, (response) => {
    if (response.error) {
      alert(`Error sending message: ${response.error}`);
      return;
    }

    document.getElementById("messageInput").value = "";
  });
}

// Load message history
function loadMessages(roomId, page = 1, limit = 20) {
  if (!socket) {
    alert("You are not connected to the server. Please connect first!");
    return;
  }

  socket.emit("loadMessages", { roomId, page, limit }, (response) => {
    if (response.success) {
      const chatWindow = document.getElementById("chatWindow");
      chatWindow.innerHTML = "";

      if (response.messages.length === 0) {
        const noMessagesElement = document.createElement("p");
        noMessagesElement.textContent = "No messages found.";
        chatWindow.appendChild(noMessagesElement);
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
  messageElement.className = `message ${isSent ? "sent" : "received"}`;

  const senderName = document.createElement("div");
  senderName.className = "sender";
  senderName.textContent = isSent ? "You" : message.senderName;

  const contentText = document.createElement("div");
  contentText.className = "content";
  contentText.textContent = message.content;

  const timestamp = document.createElement("div");
  timestamp.className = "timestamp";
  timestamp.textContent = formatTimestamp(message.createdAt);

  messageElement.appendChild(senderName);
  messageElement.appendChild(contentText);
  messageElement.appendChild(timestamp);

  chatWindow.appendChild(messageElement);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// Attach events
document.getElementById("confirmButton").onclick = startConversation;
document.getElementById("sendButton").onclick = sendMessage;
document
  .getElementById("chatWindow")
  .addEventListener("scroll", markMessagesAsRead);

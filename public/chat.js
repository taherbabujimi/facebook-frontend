// chat.js

let socket;
let currentRoomId = null;
let currenttUserId = null;
const pendingReactionUpdates = new Map();

const reactionMap = {
  "👍": "like",
  "❤️": "love",
  "😆": "laugh",
  "😮": "wow",
  "😢": "sad",
  "😠": "angry",
};

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

  // Listen for message deletion events
  socket.on("messageDeleted", (data) => {
    if (data.roomId === currentRoomId) {
      removeMessageFromUI(data.messageId);
    }
  });

  // Listen for reaction events
  socket.on("messageReactionUpdated", (data) => {
    if (data.roomId === currentRoomId) {
      updateMessageReactions(data.messageId, data.reactions);
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
    currenttUserId = user.id;

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

// Delete a message
function deleteMessage(messageId) {
  if (!socket) {
    alert("You are not connected to the server. Please connect first!");
    return;
  }

  // Show loading indicator
  const loadingIndicator = document.getElementById("loadingIndicator");
  loadingIndicator.style.display = "flex";

  socket.emit("deleteMessage", { messageId }, (response) => {
    // Hide loading indicator
    loadingIndicator.style.display = "none";

    if (response.success) {
      // The UI update will happen via the messageDeleted event
      console.log("Message deleted successfully");
    } else {
      alert(`Error deleting message: ${response.error}`);
    }
  });
}

// Add a reaction to a message
function addReaction(messageId, reaction, userId = currenttUserId) {
  if (!socket) {
    alert("You are not connected to the server. Please connect first!");
    return;
  }

  const reactionType = reactionMap[reaction];

  if (!reactionType) {
    console.error("Invalid reaction:", reaction);
    return;
  }

  socket.emit(
    "addReaction",
    { messageId, reaction: reactionType, userId },
    (response) => {
      if (!response.success) {
        alert(`Error adding reaction: ${response.error}`);
      }
    }
  );
}

// Remove a reaction from a message
function removeReaction(messageId, reaction, userId = currenttUserId) {
  if (!socket) {
    alert("You are not connected to the server. Please connect first!");
    return;
  }

  const reactionType = reactionMap[reaction];
  if (!reactionType) {
    console.error("Invalid reaction:", reaction);
    return;
  }

  socket.emit(
    "removeReaction",
    { messageId, reaction: reactionType, userId },
    (response) => {
      if (!response.success) {
        alert(`Error removing reaction: ${response.error}`);
      }
    }
  );
}

// Toggle reaction on a message
function toggleReaction(messageId, reaction) {
  const messageElement = document.getElementById(`message-${messageId}`);
  if (!messageElement) return;

  const existingReaction = messageElement.querySelector(
    `.reaction-count[data-reaction="${reaction}"]`
  );
  if (existingReaction && existingReaction.dataset.userReacted === "true") {
    removeReaction(messageId, reaction);
  } else {
    addReaction(messageId, reaction);
  }
}

// Update the reactions display for a message
function updateMessageReactions(messageId, reactions) {
  // Check if messageId is valid
  if (!messageId) {
    console.error("Invalid messageId provided", messageId);
    return;
  }

  // Handle different data formats for reactions
  let reactionsObj = {};
  if (Array.isArray(reactions)) {
    // If reactions is an array, convert it to the expected object format
    reactions.forEach((reaction) => {
      // Handle the case where each reaction has reactionType and userId
      if (reaction.reactionType && reaction.userId) {
        // If this reaction type doesn't exist yet, create an array for it
        if (!reactionsObj[reaction.reactionType]) {
          reactionsObj[reaction.reactionType] = [];
        }
        // Add this userId to the array for this reaction type
        reactionsObj[reaction.reactionType].push(reaction.userId);
      }
    });
  } else if (typeof reactions === "object" && reactions !== null) {
    // Make sure each value is an array
    for (const [key, value] of Object.entries(reactions)) {
      if (!Array.isArray(value)) {
        // If the value is not an array, convert it to an array
        reactionsObj[key] = Array.isArray(value) ? value : [value];
      } else {
        reactionsObj[key] = value;
      }
    }
  } else {
    console.error("Invalid reactions format", reactions);
    return;
  }

  // Try to find the message element
  let messageElement = document.getElementById(`message-${messageId}`);

  // If message element doesn't exist, queue the reaction update for later
  if (!messageElement) {
    pendingReactionUpdates.set(messageId.toString(), reactionsObj);
    return;
  }

  // Get or create reactions container
  let reactionsContainer = messageElement.querySelector(".message-reactions");
  if (!reactionsContainer) {
    reactionsContainer = document.createElement("div");
    reactionsContainer.className = "message-reactions";
    messageElement.appendChild(reactionsContainer);
  } else {
    reactionsContainer.innerHTML = "";
  }

  // Add reactions
  if (Object.keys(reactionsObj).length > 0) {
    // Find emoji by reaction type
    const findEmojiByType = (type) => {
      for (const [emoji, reactionType] of Object.entries(reactionMap)) {
        if (reactionType === type) {
          return emoji;
        }
      }
      return type; // Fall back to the type if no emoji is found
    };

    for (const [reactionType, users] of Object.entries(reactionsObj)) {
      if (users && users.length > 0) {
        const emoji = findEmojiByType(reactionType);
        const reactionElement = document.createElement("span");
        reactionElement.className = "reaction-count";
        reactionElement.dataset.reaction = emoji;

        // Check if current user has reacted
        const currentUserId = socket.user ? socket.user.id : null;
        const hasUserReacted = currentUserId && users.includes(currentUserId);
        reactionElement.dataset.userReacted = hasUserReacted.toString();

        // Set opacity based on whether user has reacted
        reactionElement.style.opacity = hasUserReacted ? "1" : "0.7";

        reactionElement.innerHTML = `${emoji} ${users.length}`;

        // Add click event to toggle reaction
        reactionElement.addEventListener("click", () => {
          toggleReaction(messageId, emoji);
        });

        reactionsContainer.appendChild(reactionElement);
      }
    }
  }
}

// Show reaction picker for a message
function showReactionPicker(messageElement, messageId) {
  // Close any existing reaction pickers
  closeAllReactionPickers();

  // Clone the template
  const template = document.getElementById("reactionPickerTemplate");
  const reactionPicker = template.content.cloneNode(true);

  // Get the reaction picker element
  const pickerElement = reactionPicker.querySelector(".reaction-picker");

  // Get message container dimensions
  const chatWindow = document.getElementById("chatWindow");
  const messageRect = messageElement.getBoundingClientRect();
  const chatWindowRect = chatWindow.getBoundingClientRect();

  // Add the reaction picker to the message
  messageElement.appendChild(reactionPicker);

  // Make it visible
  const addedPickerElement = messageElement.querySelector(".reaction-picker");
  addedPickerElement.classList.add("visible");

  // Calculate safe positioning that prevents overflow
  if (messageElement.classList.contains("message-sent")) {
    // For right-aligned (sent) messages
    // Position the picker to stay within container bounds on the left side
    addedPickerElement.style.right = "0";
    addedPickerElement.style.left = "auto";
    addedPickerElement.style.bottom = "-40px";

    // Check if the picker would extend beyond the left edge
    const pickerRect = addedPickerElement.getBoundingClientRect();
    if (pickerRect.left < chatWindowRect.left + 10) {
      // If too far left, position it centered below the message
      addedPickerElement.style.right = "auto";
      addedPickerElement.style.left = "50%";
      addedPickerElement.style.transform = "translateX(-50%)";
    }
  } else {
    // For left-aligned (received) messages
    // Position the picker to stay within container bounds on the right side
    addedPickerElement.style.left = "0";
    addedPickerElement.style.right = "auto";
    addedPickerElement.style.bottom = "-40px";

    // Check if the picker would extend beyond the right edge
    const pickerRect = addedPickerElement.getBoundingClientRect();
    if (pickerRect.right > chatWindowRect.right - 10) {
      // If too far right, position it centered below the message
      addedPickerElement.style.left = "50%";
      addedPickerElement.style.right = "auto";
      addedPickerElement.style.transform = "translateX(-50%)";
    }
  }

  // Add event listeners to reaction buttons
  const reactionButtons = addedPickerElement.querySelectorAll(".reaction-btn");
  reactionButtons.forEach((button) => {
    const reaction = button.dataset.reaction;
    button.addEventListener("click", () => {
      toggleReaction(messageId, reaction);
      closeAllReactionPickers();
    });
  });

  // Close picker when clicking outside
  document.addEventListener("click", closePickerOnOutsideClick);
}

// Close all reaction pickers
function closeAllReactionPickers() {
  document.removeEventListener("click", closePickerOnOutsideClick);
  const pickers = document.querySelectorAll(".reaction-picker.visible");
  pickers.forEach((picker) => {
    picker.classList.remove("visible");
    setTimeout(() => {
      if (picker.parentNode) {
        picker.parentNode.removeChild(picker);
      }
    }, 200);
  });
}

// Close picker when clicking outside
function closePickerOnOutsideClick(event) {
  if (
    !event.target.closest(".reaction-picker") &&
    !event.target.closest(".reaction-toggle")
  ) {
    closeAllReactionPickers();
  }
}

// Remove a deleted message from the UI
function removeMessageFromUI(messageId) {
  const messageElement = document.getElementById(`message-${messageId}`);
  if (messageElement) {
    // Fade out animation
    messageElement.style.opacity = "0";
    messageElement.style.transform = "scale(0.8)";

    // Remove after animation completes
    setTimeout(() => {
      messageElement.remove();

      // Check if we need to show the "no messages" indicator
      const chatWindow = document.getElementById("chatWindow");
      if (chatWindow.children.length === 0) {
        const noMessagesIndicator = document.createElement("div");
        noMessagesIndicator.id = "noMessagesIndicator";
        noMessagesIndicator.className = "no-messages";
        noMessagesIndicator.innerHTML = `
          <i class="fas fa-comments" style="font-size: 24px; margin-bottom: 12px; color: #c1c9d7"></i>
          <div>No messages in this conversation yet</div>
        `;
        chatWindow.appendChild(noMessagesIndicator);
      }
    }, 300);
  }
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
    if (!response.success) {
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
  messageElement.id = `message-${message.id}`;
  messageElement.dataset.messageId = message.id;

  // Add transition for smooth animations
  messageElement.style.transition = "opacity 0.3s ease, transform 0.3s ease";

  // Check if message has media content
  if (message.post && message.post.filePublicId) {
    // Create media container
    const mediaPreview = document.createElement("div");
    mediaPreview.className = "media-preview";

    // Create appropriate element based on media type
    const mediaElement =
      message.post.fileResourceType === "image"
        ? document.createElement("img")
        : document.createElement("video");

    mediaElement.src = message.post.fileUrl;
    mediaElement.alt = "Shared media";
    mediaElement.className = "shared-media";

    // For videos, add controls and proper attributes
    if (message.post.fileResourceType === "video") {
      mediaElement.controls = true;
      mediaElement.preload = "metadata";
      mediaElement.playsInline = true;
    }

    // Add media to preview container
    mediaPreview.appendChild(mediaElement);

    // Add media container to message
    messageElement.appendChild(mediaPreview);

    // // If there's also text content, add it below the media
    // if (message.content && message.content.trim()) {
    //   const textContent = document.createElement("div");
    //   textContent.className = "message-text";
    //   textContent.textContent = message.content;
    //   messageElement.appendChild(textContent);
    // }
  } else {
    // Text-only message
    messageElement.textContent = message.content || "";
  }

  // Add timestamp
  const timeElement = document.createElement("span");
  timeElement.className = "message-time";
  timeElement.textContent = formatTimestamp(message.createdAt || new Date());
  messageElement.appendChild(timeElement);

  // Add delete option for sent messages
  if (isSent) {
    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-message";
    deleteButton.innerHTML = '<i class="fas fa-trash"></i>';
    deleteButton.addEventListener("click", function () {
      if (confirm("Are you sure you want to delete this message?")) {
        deleteMessage(message.id);
      }
    });
    messageElement.appendChild(deleteButton);
  }

  // Add reaction toggle button
  const reactionToggle = document.createElement("button");
  reactionToggle.className = "reaction-toggle";
  reactionToggle.innerHTML = '<i class="fas fa-smile"></i>';
  reactionToggle.addEventListener("click", function (event) {
    event.stopPropagation(); // Prevent event bubbling
    showReactionPicker(messageElement, message.id);
  });
  messageElement.appendChild(reactionToggle);

  chatWindow.appendChild(messageElement);

  // Check if there are pending reaction updates for this message
  const pendingReactions = pendingReactionUpdates.get(message.id.toString());
  if (pendingReactions) {
    // Apply the pending reaction updates
    updateMessageReactions(message.id, pendingReactions);
    // Remove from pending queue
    pendingReactionUpdates.delete(message.id.toString());
  } else if (message.reactions && Object.keys(message.reactions).length > 0) {
    updateMessageReactions(message.id, message.reactions);
  }

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

  // Close reaction pickers when clicking outside
  document.addEventListener("click", (event) => {
    if (
      !event.target.closest(".reaction-picker") &&
      !event.target.closest(".reaction-toggle")
    ) {
      closeAllReactionPickers();
    }
  });
});

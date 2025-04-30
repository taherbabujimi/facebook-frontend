const express = require("express");
const path = require("path");

// Create an Express app
const app = express();

// Set the port
const PORT = 3000;

// Serve static files (e.g., HTML, CSS, JS) from the "public" directory
app.use(express.static(path.join(__dirname, "public")));

// Parse JSON bodies (for API calls)
app.use(express.json());

// Dummy API route for testing (optional)
app.post("/v1/user/userLogin", (req, res) => {
  const { email, password } = req.body;

  // Simulate backend login logic
  if (email === "test@example.com" && password === "password") {
    res.cookie("auth_token", "dummy_token", {
      httpOnly: true,
      secure: false, // Set to true if using HTTPS
      maxAge: 24 * 60 * 60 * 1000,
    });
    return res.status(200).json({ message: "Login successful!" });
  } else {
    return res.status(401).json({ message: "Invalid credentials" });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running at http://192.168.1.212:${PORT}`);
});

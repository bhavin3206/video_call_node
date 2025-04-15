const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve the frontend
app.use(express.static("public"));

// Handle WebSocket connection and signaling messages
io.on("connection", (socket) => {
  console.log("A user connected");

  // When a user sends an offer, forward it to the other user
  socket.on("offer", (offer, room) => {
    socket.to(room).emit("offer", offer);
  });

  // When a user sends an answer, forward it to the other user
  socket.on("answer", (answer, room) => {
    socket.to(room).emit("answer", answer);
  });

  // When a user sends ICE candidates, forward it to the other user
  socket.on("ice-candidate", (candidate, room) => {
    socket.to(room).emit("ice-candidate", candidate);
  });

  // When a user joins a room
  socket.on("join-room", (room) => {
    socket.join(room);
    console.log(`User joined room: ${room}`);
  });

  // When a user disconnects
  socket.on("disconnect", () => {
    console.log("A user disconnected");
  });
});

// Start the server
const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

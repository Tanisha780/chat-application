import { Server } from "socket.io";
import http from "http";
import express from "express";

import Message from "../models/message.model.js"; // Your Mongoose model

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173"],
    methods: ["GET", "POST"],
  },
});

const userSocketMap = {}; // { userId: socketId }

export function getReceiverSocketId(userId) {
  return userSocketMap[userId];
}

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  const userId = socket.handshake.query.userId;
  if (userId) {
    userSocketMap[userId] = socket.id;
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  }

  socket.on("sendMessage", async ({ senderId, receiverId, text, image }) => {
    try {
      
      const receiverSocketId = userSocketMap[receiverId];
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("newMessage");
      }

      // **Remove echo to sender** to avoid duplicates
      // socket.emit("newMessage", newMessage);  <-- Removed
    } catch (error) {
      console.error("Error saving message:", error);
    }
  });

  socket.on("disconnect", () => {
    console.log("A user disconnected:", socket.id);
    if (userId) {
      delete userSocketMap[userId];
      io.emit("getOnlineUsers", Object.keys(userSocketMap));
    }
  });
});

export { io, app, server };

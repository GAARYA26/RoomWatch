const Room = require("../models/Room");

const roomStates = {};

function getVideoId(url) {
  const match = url.match(/(?:v=|youtu\.be\/)([^&\s]+)/);
  return match ? match[1] : null;
}

function initSocket(io) {
  io.on("connection", (socket) => {
    console.log("🔌 Connected:", socket.id);

    // Join room
    socket.on("room:join", async ({ roomCode, userId, userName, avatar }) => {
      socket.join(roomCode);
      socket.roomCode = roomCode;
      socket.userId = userId;
      socket.userName = userName;

      if (!roomStates[roomCode]) {
        const room = await Room.findOne({ code: roomCode });
        roomStates[roomCode] = {
          isPlaying: room?.isPlaying || false,
          currentTime: room?.currentTime || 0,
          videoId: room?.videoId || "",
          hostId: room?.host?.toString(),
          members: {},
          screenSharerName: null,
        };
      }

      roomStates[roomCode].members[socket.id] = {
        socketId: socket.id,
        userId,
        userName,
        avatar,
        isMuted: true,
        isSpeaking: false,
      };

      socket.emit("room:state", roomStates[roomCode]);
      io.to(roomCode).emit("room:members", Object.values(roomStates[roomCode].members));

      // Tell new joiner about existing peers for WebRTC
      const existingPeers = Object.keys(roomStates[roomCode].members).filter(
        (id) => id !== socket.id
      );
      socket.emit("webrtc:existing-peers", { peers: existingPeers });

      // System message
      io.to(roomCode).emit("room:chat", {
        message: `${userName} joined the room`,
        userName: "System",
        avatar: "",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        id: Date.now(),
        isSystem: true,
      });
    });

    // Host sets YouTube URL
    socket.on("room:setvideo", async ({ roomCode, youtubeUrl }) => {
      const videoId = getVideoId(youtubeUrl);
      if (!videoId) return socket.emit("room:error", "Invalid YouTube URL");
      if (roomStates[roomCode]) {
        roomStates[roomCode].videoId = videoId;
        roomStates[roomCode].currentTime = 0;
        roomStates[roomCode].isPlaying = false;
      }
      await Room.findOneAndUpdate({ code: roomCode }, {
        videoId, youtubeUrl, currentTime: 0, isPlaying: false,
      });
      io.to(roomCode).emit("room:newvideo", { videoId });
    });

    // Play
    socket.on("room:play", ({ roomCode, currentTime }) => {
      if (!roomStates[roomCode]) return;
      roomStates[roomCode].isPlaying = true;
      roomStates[roomCode].currentTime = currentTime;
      socket.to(roomCode).emit("room:play", {
        currentTime,
        serverTimestamp: Date.now(),
      });
    });

    // Pause
    socket.on("room:pause", ({ roomCode, currentTime }) => {
      if (!roomStates[roomCode]) return;
      roomStates[roomCode].isPlaying = false;
      roomStates[roomCode].currentTime = currentTime;
      socket.to(roomCode).emit("room:pause", { currentTime });
      Room.findOneAndUpdate({ code: roomCode }, { isPlaying: false, currentTime }).catch(() => {});
    });

    // Seek
    socket.on("room:seek", ({ roomCode, currentTime }) => {
      if (!roomStates[roomCode]) return;
      roomStates[roomCode].currentTime = currentTime;
      socket.to(roomCode).emit("room:seek", { currentTime });
    });

    // Reaction
    socket.on("room:reaction", ({ roomCode, emoji, videoTimestamp, userName }) => {
      io.to(roomCode).emit("room:reaction", {
        emoji, videoTimestamp, userName,
        id: Date.now() + Math.random(),
      });
    });

    // Chat
    socket.on("room:chat", ({ roomCode, message, userName, avatar }) => {
      io.to(roomCode).emit("room:chat", {
        message, userName, avatar,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        id: Date.now(),
      });
    });

    // ── WEBRTC SIGNALING ──────────────────────────────────────

    socket.on("webrtc:offer", ({ targetSocketId, offer }) => {
      io.to(targetSocketId).emit("webrtc:offer", { offer, fromSocketId: socket.id });
    });

    socket.on("webrtc:answer", ({ targetSocketId, answer }) => {
      io.to(targetSocketId).emit("webrtc:answer", { answer, fromSocketId: socket.id });
    });

    socket.on("webrtc:ice-candidate", ({ targetSocketId, candidate }) => {
      io.to(targetSocketId).emit("webrtc:ice-candidate", { candidate, fromSocketId: socket.id });
    });

    // ── VOICE ────────────────────────────────────────────────

    socket.on("voice:mute", ({ roomCode, isMuted }) => {
      if (roomStates[roomCode]?.members[socket.id]) {
        roomStates[roomCode].members[socket.id].isMuted = isMuted;
        io.to(roomCode).emit("room:members", Object.values(roomStates[roomCode].members));
      }
    });

    socket.on("voice:speaking", ({ roomCode, isSpeaking }) => {
      if (roomStates[roomCode]?.members[socket.id]) {
        roomStates[roomCode].members[socket.id].isSpeaking = isSpeaking;
        socket.to(roomCode).emit("voice:speaking", { socketId: socket.id, isSpeaking });
      }
    });

    // ── SCREEN SHARE ─────────────────────────────────────────

    socket.on("screen:start", ({ roomCode }) => {
      if (roomStates[roomCode]) roomStates[roomCode].screenSharerName = socket.userName;
      socket.to(roomCode).emit("screen:started", {
        sharerSocketId: socket.id,
        sharerName: socket.userName,
      });
      io.to(roomCode).emit("room:chat", {
        message: `${socket.userName} started screen sharing 🖥`,
        userName: "System", avatar: "",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        id: Date.now(), isSystem: true,
      });
    });

    socket.on("screen:stop", ({ roomCode }) => {
      if (roomStates[roomCode]) roomStates[roomCode].screenSharerName = null;
      io.to(roomCode).emit("screen:stopped", { sharerSocketId: socket.id });
      io.to(roomCode).emit("room:chat", {
        message: `${socket.userName} stopped screen sharing`,
        userName: "System", avatar: "",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        id: Date.now(), isSystem: true,
      });
    });

    socket.on("screen:offer", ({ targetSocketId, offer }) => {
      io.to(targetSocketId).emit("screen:offer", { offer, fromSocketId: socket.id });
    });

    socket.on("screen:answer", ({ targetSocketId, answer }) => {
      io.to(targetSocketId).emit("screen:answer", { answer, fromSocketId: socket.id });
    });

    socket.on("screen:ice-candidate", ({ targetSocketId, candidate }) => {
      io.to(targetSocketId).emit("screen:ice-candidate", { candidate, fromSocketId: socket.id });
    });

    // ── DISCONNECT ───────────────────────────────────────────

    socket.on("disconnect", () => {
      const { roomCode, userName } = socket;
      if (!roomCode || !roomStates[roomCode]) return;

      if (roomStates[roomCode].screenSharerName === userName) {
        roomStates[roomCode].screenSharerName = null;
        io.to(roomCode).emit("screen:stopped", { sharerSocketId: socket.id });
      }

      delete roomStates[roomCode].members[socket.id];
      io.to(roomCode).emit("room:members", Object.values(roomStates[roomCode].members));
      io.to(roomCode).emit("webrtc:peer-left", { socketId: socket.id });
      io.to(roomCode).emit("room:chat", {
        message: `${userName} left the room`,
        userName: "System", avatar: "",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        id: Date.now(), isSystem: true,
      });

      if (Object.keys(roomStates[roomCode].members).length === 0) {
        delete roomStates[roomCode];
      }
    });
  });
}

module.exports = { initSocket };
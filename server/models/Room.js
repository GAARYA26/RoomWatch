const mongoose = require("mongoose");

const RoomSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  host: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  videoId: { type: String, default: "" },
  youtubeUrl: { type: String, default: "" },
  isPlaying: { type: Boolean, default: false },
  currentTime: { type: Number, default: 0 },
  lastSyncAt: { type: Date, default: Date.now },
  members: [
    {
      userId: mongoose.Schema.Types.ObjectId,
      name: String,
      joinedAt: { type: Date, default: Date.now },
    },
  ],
  createdAt: { type: Date, default: Date.now, expires: 86400 },
});

module.exports = mongoose.model("Room", RoomSchema);
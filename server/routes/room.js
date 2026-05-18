const express = require("express");
const router = express.Router();
const Room = require("../models/Room");
const auth = require("../middleware/authMiddleware");

function makeCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getVideoId(url) {
  const match = url.match(/(?:v=|youtu\.be\/)([^&\s]+)/);
  return match ? match[1] : null;
}

// Create room
router.post("/create", auth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: "Room name required" });
    const code = makeCode();
    const room = await Room.create({
      code,
      name,
      host: req.user.id,
      members: [{ userId: req.user.id, name: req.user.name }],
    });
    res.json(room);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get room by code
router.get("/:code", async (req, res) => {
  try {
    const room = await Room.findOne({ code: req.params.code.toUpperCase() });
    if (!room) return res.status(404).json({ message: "Room not found" });
    res.json(room);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Save reaction
router.post("/:code/reaction", auth, async (req, res) => {
  try {
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
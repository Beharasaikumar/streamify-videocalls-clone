import { streamClient } from "../lib/stream.js";
import Room from "../models/Room.js";

export async function getAllRooms(req, res) {
  try {
    const rooms = await Room.find().sort({ createdAt: -1 });

    const filter = { type: "messaging", isGroupRoom: true };
    const sort = [{ last_message_at: -1 }];
    const channels = await streamClient.queryChannels(filter, sort, {
      watch: false,
      state: true,
    });

    const channelMap = {};
    channels.forEach((ch) => {
      channelMap[ch.id] = {
        memberCount: Object.keys(ch.state?.members || {}).length,
        lastMessage: ch.state?.messages?.slice(-1)[0]?.text || null,
      };
    });

    const result = rooms.map((room) => ({
      id: room.roomId,
      name: room.name,
      topic: room.topic,
      emoji: room.emoji,
      createdBy: room.createdBy,
      memberCount: channelMap[room.roomId]?.memberCount || 0,
      lastMessage: channelMap[room.roomId]?.lastMessage || null,
    }));

    res.status(200).json(result);
  } catch (error) {
    console.error("Error in getAllRooms:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function createRoom(req, res) {
  try {
    const { name, topic, emoji } = req.body;
    const userId = req.user._id.toString();

    if (!name || !topic) {
      return res.status(400).json({ message: "Name and topic are required" });
    }

    const roomId = "room-" + name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

    const existing = await Room.findOne({ roomId });
    if (existing) {
      return res.status(400).json({ message: "A room with this name already exists" });
    }

    const room = await Room.create({
      roomId,
      name,
      topic,
      emoji: emoji || "💬",
      createdBy: req.user._id,
    });

    const channel = streamClient.channel("messaging", roomId, {
      name,
      topic,
      emoji: emoji || "💬",
      isGroupRoom: true,
      created_by_id: userId,
    });
    await channel.create();
    await channel.addMembers([userId]);

    res.status(201).json({
      id: room.roomId,
      name: room.name,
      topic: room.topic,
      emoji: room.emoji,
      memberCount: 1,
      lastMessage: null,
    });
  } catch (error) {
    console.error("Error in createRoom:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function joinRoom(req, res) {
  try {
    const { roomId } = req.params;
    const userId = req.user._id.toString();

    const room = await Room.findOne({ roomId });
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    const channel = streamClient.channel("messaging", roomId);
    await channel.addMembers([userId]);

    res.status(200).json({ roomId, name: room.name, topic: room.topic });
  } catch (error) {
    console.error("Error in joinRoom:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function updateRoom(req, res) {
  try {
    const { roomId } = req.params;
    const { name, topic, emoji } = req.body;

    const room = await Room.findOne({ roomId });
    if (!room) return res.status(404).json({ message: "Room not found" });

    if (room.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the room creator can edit this room" });
    }

    room.name = name || room.name;
    room.topic = topic || room.topic;
    room.emoji = emoji || room.emoji;
    await room.save();

    const channel = streamClient.channel("messaging", roomId);
    await channel.update({ name: room.name, topic: room.topic, emoji: room.emoji });

    res.status(200).json({ message: "Room updated", room });
  } catch (error) {
    console.error("Error in updateRoom:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function deleteRoom(req, res) {
  try {
    const { roomId } = req.params;

    const room = await Room.findOne({ roomId });
    if (!room) return res.status(404).json({ message: "Room not found" });

    if (room.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the room creator can delete this room" });
    }

    await Room.deleteOne({ roomId });

    const channel = streamClient.channel("messaging", roomId);
    await channel.delete();

    res.status(200).json({ message: "Room deleted" });
  } catch (error) {
    console.error("Error in deleteRoom:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}
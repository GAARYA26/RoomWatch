import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { io } from "socket.io-client";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
const ICE_SERVERS = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
const EMOJIS = ["😂", "😮", "❤️", "🔥", "👏", "😭", "🤯", "💀"];

export default function Room() {
  const { code } = useParams();
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("rw_user") || "{}");
  const token = localStorage.getItem("rw_token");

  // Room state
  const [room, setRoom] = useState(null);
  const [members, setMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const isHostRef = useRef(false); // ref so initPlayer closure always has latest value

  // Video state
  const [videoId, setVideoId] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [syncState, setSyncState] = useState({
    isPlaying: false,
    currentTime: 0,
  });
  const [floatingReactions, setFloatingReactions] = useState([]);
  const playerRef = useRef(null);
  const playerInstanceRef = useRef(null);
  const isSyncingRef = useRef(false);
  const currentCodeRef = useRef(code); // stable ref for closures

  // Chat
  const [chatInput, setChatInput] = useState("");
  const chatBottomRef = useRef(null);

  // Voice
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const localStreamRef = useRef(null);
  const peerConnsRef = useRef({});
  const audioCtxRef = useRef(null);
  const speakFrameRef = useRef(null);

  // Screen share
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [incomingStream, setIncomingStream] = useState(null);
  const [incomingSharerName, setIncomingSharerName] = useState("");
  const screenStreamRef = useRef(null);
  const screenPeerConnsRef = useRef({});
  const screenVideoRef = useRef(null);
  const remoteScreenStreamRef = useRef(null);

  // Heatmap
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [heatmapData] = useState(() =>
    Array.from({ length: 40 }, () => Math.floor(Math.random() * 20)),
  );

  // Socket ref — stable across renders
  const socketRef = useRef(null);

  const screenActive =
    isScreenSharing ||
    incomingStream ||
    (screenVideoRef.current && screenVideoRef.current.srcObject);
  // ── VOICE HELPERS (defined before useEffect so cleanup can call them) ──

  const stopVoice = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    Object.values(peerConnsRef.current).forEach((pc) => pc.close());
    peerConnsRef.current = {};
    document.querySelectorAll("[id^='rw-audio-']").forEach((el) => el.remove());
    if (speakFrameRef.current) cancelAnimationFrame(speakFrameRef.current);
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    setIsVoiceActive(false);
    setIsMuted(true);
  }, []);

  const stopScreen = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    Object.values(screenPeerConnsRef.current).forEach((pc) => pc.close());
    screenPeerConnsRef.current = {};
    setIsScreenSharing(false);
    setIncomingStream(null);

    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = null;
    }
    if (socketRef.current) {
      socketRef.current.emit("screen:stop", {
        roomCode: currentCodeRef.current,
      });
    }
  }, []);

  // ── WEBRTC PEER CONNECTION HELPERS ────────────────────────

  const createVoicePeerConn = useCallback((targetSocketId) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnsRef.current[targetSocketId] = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate && socketRef.current) {
        socketRef.current.emit("webrtc:ice-candidate", {
          targetSocketId,
          candidate: e.candidate,
        });
      }
    };

    pc.ontrack = (e) => {
      let audio = document.getElementById(`rw-audio-${targetSocketId}`);
      if (!audio) {
        audio = document.createElement("audio");
        audio.id = `rw-audio-${targetSocketId}`;
        audio.autoplay = true;
        document.body.appendChild(audio);
      }
      audio.srcObject = e.streams[0];
    };

    // Add local tracks if mic is already active
    if (localStreamRef.current) {
      localStreamRef.current
        .getTracks()
        .forEach((t) => pc.addTrack(t, localStreamRef.current));
    }

    return pc;
  }, []);

  const connectToPeer = useCallback(
    async (targetSocketId, asOfferer) => {
      if (!localStreamRef.current || !socketRef.current) return;
      const pc = createVoicePeerConn(targetSocketId);
      if (asOfferer) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketRef.current.emit("webrtc:offer", { targetSocketId, offer });
      }
    },
    [createVoicePeerConn],
  );

  // ── SOCKET SETUP ──────────────────────────────────────────

  useEffect(() => {
    if (!code || !user?.id) return;

    const socket = io(SOCKET_URL, {
      transports: ["websocket"],
      query: { roomCode: code, userId: user.id },
    });
    socketRef.current = socket;
    currentCodeRef.current = code;

    socket.on("connect", () => {
      axios
        .get(`${API}/room/${code}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        .then((res) => {
          setRoom(res.data);
          setVideoId(res.data.videoId || "");
          const hostId = res.data.host?._id || res.data.host;
          const amHost = hostId?.toString() === user.id?.toString();
          setIsHost(amHost);
          isHostRef.current = amHost;

          socket.emit("room:join", {
            roomCode: code,
            userId: user.id,
            userName: user.name,
            avatar: user.avatar,
          });
        })
        .catch(() => navigate("/"));
    });

    socket.on("room:state", (state) => {
      if (state.videoId) setVideoId(state.videoId);
      setSyncState({
        isPlaying: state.isPlaying,
        currentTime: state.currentTime,
      });
    });

    socket.on("room:newvideo", ({ videoId: vid }) => {
      setVideoId(vid);
      setSyncState({ isPlaying: false, currentTime: 0 });
    });

    socket.on("room:play", ({ currentTime, serverTimestamp }) => {
      const delay = (Date.now() - serverTimestamp) / 1000;
      setSyncState({ isPlaying: true, currentTime: currentTime + delay });
    });

    socket.on("room:pause", ({ currentTime }) => {
      setSyncState({ isPlaying: false, currentTime });
    });

    socket.on("room:seek", ({ currentTime }) => {
      setSyncState((p) => ({ ...p, currentTime }));
    });

    socket.on("room:reaction", ({ emoji, id }) => {
      const x = Math.random() * 65 + 15;
      setFloatingReactions((p) => [...p, { emoji, id, x }]);
      setTimeout(
        () => setFloatingReactions((p) => p.filter((r) => r.id !== id)),
        2000,
      );
    });

    socket.on("room:chat", (msg) => {
      setMessages((p) => [...p, msg]);
    });

    socket.on("room:members", (list) => {
      setMembers(
        list.map((m, index) => ({
          ...m,
          socketId: Object.keys(peerConnsRef.current)[index] || m.socketId,
        })),
      );
    });
    // WebRTC — voice
    socket.on("webrtc:existing-peers", ({ peers }) => {
      peers.forEach((targetSocketId) => connectToPeer(targetSocketId, true));
    });

    socket.on("webrtc:offer", async ({ offer, fromSocketId }) => {
      if (!localStreamRef.current) return;
      const pc = createVoicePeerConn(fromSocketId);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("webrtc:answer", { targetSocketId: fromSocketId, answer });
    });

    socket.on("webrtc:answer", async ({ answer, fromSocketId }) => {
      const pc = peerConnsRef.current[fromSocketId];
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on("webrtc:ice-candidate", async ({ candidate, fromSocketId }) => {
      const pc = peerConnsRef.current[fromSocketId];
      if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate));
    });

    socket.on("webrtc:peer-left", ({ socketId }) => {
      peerConnsRef.current[socketId]?.close();
      delete peerConnsRef.current[socketId];
      screenPeerConnsRef.current[socketId]?.close();
      delete screenPeerConnsRef.current[socketId];
      document.getElementById(`rw-audio-${socketId}`)?.remove();
    });

    // Screen share
    socket.on("screen:started", ({ sharerName }) => {
      setIncomingSharerName(sharerName);
    });

    socket.on("screen:stopped", () => {
      setIncomingStream(null);

      setIncomingSharerName("");

      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = null;
      }
    });

    socket.on("screen:offer", async ({ offer, fromSocketId }) => {
      const pc = new RTCPeerConnection(ICE_SERVERS);
      screenPeerConnsRef.current[fromSocketId] = pc;
      pc.onicecandidate = (e) => {
        if (e.candidate)
          socket.emit("screen:ice-candidate", {
            targetSocketId: fromSocketId,
            candidate: e.candidate,
          });
      };
      pc.ontrack = (e) => {
        console.log("SCREEN TRACK RECEIVED");

        const stream = e.streams[0];

        setIncomingStream(stream);

        setTimeout(() => {
          if (screenVideoRef.current) {
            screenVideoRef.current.srcObject = stream;

            screenVideoRef.current.play().catch(() => {});
          }
        }, 100);
      };
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("screen:answer", { targetSocketId: fromSocketId, answer });
    });

    socket.on("screen:answer", async ({ answer, fromSocketId }) => {
      const pc = screenPeerConnsRef.current[fromSocketId];
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on("screen:ice-candidate", async ({ candidate, fromSocketId }) => {
      const pc = screenPeerConnsRef.current[fromSocketId];
      if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      stopVoice();
      // Stop screen without emitting (socket already disconnected)
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      Object.values(screenPeerConnsRef.current).forEach((pc) => pc.close());
      screenPeerConnsRef.current = {};
    };
  }, [code]); // eslint-disable-line

  // Sync screen stream to video element
  useEffect(() => {
    if (!screenVideoRef.current) return;

    if (incomingStream) {
      screenVideoRef.current.srcObject = incomingStream;

      screenVideoRef.current.play().catch((e) => console.log(e));
    } else if (!isScreenSharing) {
      screenVideoRef.current.srcObject = null;
    }
  }, [incomingStream, isScreenSharing]);

  // Scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── YOUTUBE PLAYER ────────────────────────────────────────

  useEffect(() => {
    if (!videoId) return;

    const initPlayer = () => {
      playerInstanceRef.current?.destroy();
      playerInstanceRef.current = new window.YT.Player("yt-player", {
        videoId,
        playerVars: {
          controls: isHostRef.current ? 1 : 0,
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
        },
        events: {
          onReady: (e) => {
            playerRef.current = e.target;
          },
          onStateChange: (e) => {
            if (
              isSyncingRef.current ||
              !isHostRef.current ||
              !socketRef.current
            )
              return;
            const t = e.target.getCurrentTime();
            if (e.data === window.YT.PlayerState.PLAYING) {
              socketRef.current.emit("room:play", {
                roomCode: currentCodeRef.current,
                currentTime: t,
              });
            } else if (e.data === window.YT.PlayerState.PAUSED) {
              socketRef.current.emit("room:pause", {
                roomCode: currentCodeRef.current,
                currentTime: t,
              });
            }
          },
        },
      });
    };

    if (!window.YT || !window.YT.Player) {
      // API not loaded yet — load it
      if (!document.getElementById("yt-api-script")) {
        const tag = document.createElement("script");
        tag.id = "yt-api-script";
        tag.src = "https://www.youtube.com/iframe_api";
        document.body.appendChild(tag);
      }
      window.onYouTubeIframeAPIReady = initPlayer;
    } else {
      // API already loaded
      initPlayer();
    }

    return () => {
      playerInstanceRef.current?.destroy();
      playerInstanceRef.current = null;
    };
  }, [videoId]);

  // Apply sync state from server to player
  useEffect(() => {
    if (!playerInstanceRef.current?.seekTo) return;
    isSyncingRef.current = true;
    const current = playerInstanceRef.current.getCurrentTime?.() || 0;
    if (Math.abs(current - syncState.currentTime) > 1) {
      playerInstanceRef.current.seekTo(syncState.currentTime, true);
    }
    if (syncState.isPlaying) {
      playerInstanceRef.current.playVideo?.();
    } else {
      playerInstanceRef.current.pauseVideo?.();
    }
    setTimeout(() => {
      isSyncingRef.current = false;
    }, 150);
  }, [syncState]);

  // ── VOICE ─────────────────────────────────────────────────

  const startVoice = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      // Start muted by default
      stream.getAudioTracks().forEach((t) => {
        t.enabled = false;
      });
      setIsVoiceActive(true);
      setIsMuted(true);
      members.forEach((member) => {
        if (member.userId !== user.id && member.socketId) {
          connectToPeer(member.socketId, true);
        }
      });

      // Speaking detection via Web Audio API
      audioCtxRef.current = new AudioContext();
      const analyser = audioCtxRef.current.createAnalyser();
      audioCtxRef.current.createMediaStreamSource(stream).connect(analyser);
      analyser.fftSize = 512;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const detect = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        if (socketRef.current) {
          socketRef.current.emit("voice:speaking", {
            roomCode: currentCodeRef.current,
            isSpeaking: avg > 15,
          });
        }
        speakFrameRef.current = requestAnimationFrame(detect);
      };
      detect();
    } catch {
      alert("Please allow microphone access to use voice chat.");
    }
  };

  const toggleMute = () => {
    if (!localStreamRef.current || !socketRef.current) return;
    const next = !isMuted;
    localStreamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
    setIsMuted(next);
    socketRef.current.emit("voice:mute", {
      roomCode: currentCodeRef.current,
      isMuted: next,
    });
  };

  // ── SCREEN SHARE ──────────────────────────────────────────

  const startScreen = async () => {
    if (!socketRef.current) return;
    try {
      // hide youtube before screen share

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always" },
        audio: true,
      });

      screenStreamRef.current = stream;
      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = stream;

        screenVideoRef.current.play().catch(() => {});
      }
      setIsScreenSharing(true);
      socketRef.current.emit("screen:start", {
        roomCode: currentCodeRef.current,
      });

      // When user clicks browser's "Stop sharing" button
      stream.getVideoTracks()[0].onended = () => stopScreen();

      // Create peer connections for all voice peers to send screen stream
      for (const member of members) {
        if (member.userId === user.id) continue;

        const targetSocketId = member.socketId;

        if (!targetSocketId) continue;

        const pc = new RTCPeerConnection(ICE_SERVERS);

        screenPeerConnsRef.current[targetSocketId] = pc;

        stream.getTracks().forEach((t) => {
          pc.addTrack(t, stream);
        });

        pc.onicecandidate = (e) => {
          if (e.candidate && socketRef.current) {
            socketRef.current.emit("screen:ice-candidate", {
              targetSocketId,
              candidate: e.candidate,
            });
          }
        };

        const offer = await pc.createOffer();

        await pc.setLocalDescription(offer);

        socketRef.current.emit("screen:offer", {
          targetSocketId,
          offer,
        });
      }
    } catch (err) {
      if (err.name !== "NotAllowedError")
        console.error("Screen share error:", err);
    }
  };

  // ── EVENT HANDLERS ────────────────────────────────────────

  const loadVideo = () => {
    if (!urlInput.trim() || !isHostRef.current || !socketRef.current) {
      return;
    }

    let cleanUrl = urlInput.trim();

    // convert youtu.be links
    if (cleanUrl.includes("youtu.be/")) {
      const id = cleanUrl.split("youtu.be/")[1].split("?")[0];

      cleanUrl = `https://www.youtube.com/watch?v=${id}`;
    }

    // remove extra params
    cleanUrl = cleanUrl.split("&")[0];

    socketRef.current.emit("room:setvideo", {
      roomCode: currentCodeRef.current,
      youtubeUrl: cleanUrl,
    });

    setUrlInput("");
  };
  const sendReaction = (emoji) => {
    if (!socketRef.current) return;
    const t = playerRef.current?.getCurrentTime?.() || 0;
    socketRef.current.emit("room:reaction", {
      roomCode: currentCodeRef.current,
      emoji,
      videoTimestamp: Math.floor(t),
      userName: user.name,
    });
  };

  const sendChat = () => {
    if (!chatInput.trim() || !socketRef.current) return;
    socketRef.current.emit("room:chat", {
      roomCode: currentCodeRef.current,
      message: chatInput.trim(),
      userName: user.name,
      avatar: user.avatar,
    });
    setChatInput("");
  };

  const copyCode = () => {
    navigator.clipboard.writeText(code);
  };

  // ── LOADING STATE ─────────────────────────────────────────

  if (!room) {
    return (
      <div
        style={{
          height: "calc(100vh - 70px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text2)",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "14px" }}>🎬</div>
          <p style={{ fontSize: "16px" }}>Loading room...</p>
        </div>
      </div>
    );
  }

  // ── RENDER ────────────────────────────────────────────────

  return (
    <div
      style={{
        display: "flex",
        height: "calc(100vh - 70px)",
        overflow: "hidden",
      }}
    >
      {/* ── MAIN AREA ── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minWidth: 0,
        }}
      >
        {/* Room top bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 20px",
            height: "52px",
            flexShrink: 0,
            background: "var(--surface)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "15px", fontWeight: 700 }}>
              {room.name}
            </span>
            <span className="live-badge">
              <span className="live-dot" />
              LIVE
            </span>
            {screenActive && (
              <span
                style={{
                  fontSize: "12px",
                  color: "var(--accent-light)",
                  background: "var(--accent-glow)",
                  padding: "3px 10px",
                  borderRadius: "20px",
                }}
              >
                🖥 Screen sharing
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "13px", color: "var(--text2)" }}>
              Code
            </span>
            <span
              onClick={copyCode}
              title="Click to copy"
              style={{
                fontSize: "15px",
                fontWeight: 700,
                letterSpacing: "3px",
                color: "var(--accent-light)",
                background: "var(--accent-glow)",
                padding: "4px 12px",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              {code}
            </span>
          </div>
        </div>

        {/* YouTube URL input — host only, hidden during screen share */}
        {isHost && !screenActive && (
          <div
            style={{
              display: "flex",
              gap: "10px",
              padding: "14px 16px",
              background: "var(--surface)",
              borderBottom: "1px solid var(--border)",
              flexShrink: 0,
            }}
          >
            <input
              className="rw-input"
              placeholder="Paste YouTube URL..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadVideo()}
            />

            <button className="rw-btn rw-btn-primary" onClick={loadVideo}>
              Load
            </button>
          </div>
        )}

        {/* Player / Screen share area */}
        <div
          style={{
            flex: 1,
            background: "#000",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {screenActive ? (
            <video
              ref={screenVideoRef}
              autoPlay
              playsInline
              muted={isScreenSharing}
              onLoadedMetadata={() => {
                screenVideoRef.current?.play();
              }}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                background: "#000",
              }}
            />
          ) : videoId ? (
            <>
              <div
                id="yt-player"
                style={{
                  width: "100%",
                  height: "100%",
                }}
              />

              {floatingReactions.map((r) => (
                <div
                  key={r.id}
                  className="float-reaction"
                  style={{
                    left: `${r.x}%`,
                    bottom: "70px",
                    position: "absolute",
                    fontSize: "34px",
                    animation: "floatUp 2s ease-out forwards",
                    pointerEvents: "none",
                    zIndex: 9999,
                  }}
                >
                  {r.emoji}
                </div>
              ))}

              {!isHost && (
                <div
                  style={{
                    position: "absolute",
                    bottom: "12px",
                    right: "14px",
                    fontSize: "12px",
                    color: "rgba(255,255,255,0.4)",
                    background: "rgba(0,0,0,0.55)",
                    padding: "4px 10px",
                    borderRadius: "5px",
                  }}
                >
                  Synced to host
                </div>
              )}
            </>
          ) : (
            <div
              style={{
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                gap: "16px",
                color: "var(--muted)",
              }}
            >
              <div style={{ fontSize: "56px" }}>📺</div>

              <p
                style={{
                  fontSize: "15px",
                  textAlign: "center",
                  maxWidth: "320px",
                  lineHeight: 1.7,
                }}
              >
                {isHost
                  ? "Paste a YouTube URL above — or share your screen to watch Netflix, Prime, Hotstar"
                  : "Waiting for host to load a video or share their screen..."}
              </p>
            </div>
          )}
        </div>

        {/* Reaction bar — shown only when video is active */}
        {(videoId || screenActive) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "10px 16px",
              background: "var(--surface)",
              borderTop: "1px solid var(--border)",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontSize: "12px",
                color: "var(--muted)",
                marginRight: "4px",
                fontWeight: 500,
              }}
            >
              React:
            </span>
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => sendReaction(emoji)}
                style={{
                  background: "var(--surface3)",
                  border: "1px solid var(--border2)",
                  borderRadius: "8px",
                  padding: "6px 10px",
                  fontSize: "20px",
                  cursor: "pointer",
                  lineHeight: 1,
                  transition: "transform 0.15s, border-color 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.3)";
                  e.currentTarget.style.borderColor = "var(--accent)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                  e.currentTarget.style.borderColor = "var(--border2)";
                }}
              >
                {emoji}
              </button>
            ))}
            <button
              onClick={() => setShowHeatmap((p) => !p)}
              style={{
                marginLeft: "auto",
                fontSize: "12px",
                color: "var(--accent-light)",
                background: "var(--accent-glow)",
                border: "1px solid rgba(99,102,241,0.25)",
                borderRadius: "7px",
                padding: "6px 12px",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              📊 Heatmap
            </button>
          </div>
        )}

        {/* Heatmap panel */}
        {showHeatmap && (
          <div
            style={{
              background: "var(--surface)",
              borderTop: "1px solid var(--border)",
              padding: "12px 16px",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontSize: "11px",
                color: "var(--muted)",
                marginBottom: "8px",
                fontWeight: 500,
              }}
            >
              Reaction heatmap — where people reacted most
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: "2px",
                height: "40px",
              }}
            >
              {heatmapData.map((v, i) => {
                const pct = Math.round((v / Math.max(...heatmapData)) * 100);
                const opacity = 0.25 + (pct / 100) * 0.75;
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      borderRadius: "2px 2px 0 0",
                      height: `${Math.max(pct, 4)}%`,
                      background: `rgba(99,102,241,${opacity})`,
                      cursor: "pointer",
                      transition: "height 0.3s",
                    }}
                    title={`${Math.round(i * 6)}s — ${v} reactions`}
                  />
                );
              })}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: "4px",
              }}
            >
              {["0:00", "1:00", "2:00", "3:00", "4:00"].map((t) => (
                <span
                  key={t}
                  style={{ fontSize: "10px", color: "var(--muted)" }}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Voice + Screen share toolbar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 16px",
            background: "var(--surface)",
            borderTop: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          {!isVoiceActive ? (
            <button
              onClick={startVoice}
              style={toolBtn(
                "#22c55e",
                "rgba(34,197,94,0.1)",
                "rgba(34,197,94,0.3)",
              )}
            >
              🎙 Join Voice
            </button>
          ) : (
            <>
              <button
                onClick={toggleMute}
                style={toolBtn(
                  isMuted ? "#f97316" : "#22c55e",
                  isMuted ? "rgba(249,115,22,0.1)" : "rgba(34,197,94,0.1)",
                  isMuted ? "rgba(249,115,22,0.3)" : "rgba(34,197,94,0.3)",
                )}
              >
                {isMuted ? "🔇 Muted" : "🎙 Live"}
              </button>
              <button
                onClick={stopVoice}
                style={toolBtn(
                  "#ef4444",
                  "rgba(239,68,68,0.08)",
                  "rgba(239,68,68,0.25)",
                )}
              >
                📵 Leave
              </button>
            </>
          )}

          <div
            style={{
              width: "1px",
              height: "22px",
              background: "var(--border2)",
              margin: "0 2px",
            }}
          />

          {!isScreenSharing ? (
            <button
              onClick={startScreen}
              style={toolBtn(
                "var(--accent-light)",
                "var(--accent-glow)",
                "rgba(99,102,241,0.3)",
              )}
            >
              🖥 Share Screen
            </button>
          ) : (
            <button
              onClick={stopScreen}
              style={toolBtn(
                "#ef4444",
                "rgba(239,68,68,0.08)",
                "rgba(239,68,68,0.25)",
              )}
            >
              ⏹ Stop Sharing
            </button>
          )}

          {incomingSharerName && !isScreenSharing && (
            <div
              style={{
                fontSize: "12px",
                color: "var(--accent-light)",
                background: "var(--accent-glow)",
                border: "1px solid rgba(99,102,241,0.2)",
                padding: "5px 12px",
                borderRadius: "20px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  background: "var(--accent)",
                  borderRadius: "50%",
                }}
              />
              {incomingSharerName} is sharing
            </div>
          )}

          <span
            style={{
              marginLeft: "auto",
              fontSize: "12px",
              color: "var(--muted)",
            }}
          >
            {isVoiceActive
              ? isMuted
                ? "You are muted"
                : "🎙 Voice live"
              : "Voice off"}
          </span>
        </div>
      </div>

      {/* ── RIGHT SIDEBAR ── */}
      <div
        style={{
          width: "290px",
          borderLeft: "1px solid var(--border)",
          background: "var(--surface)",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {/* Members list */}
        <div
          style={{
            padding: "16px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "14px",
            }}
          >
            <span style={{ fontSize: "13px", fontWeight: 700 }}>In room</span>
            <span
              style={{
                fontSize: "12px",
                color: "var(--muted)",
                background: "var(--surface3)",
                padding: "2px 10px",
                borderRadius: "10px",
              }}
            >
              {members.length}
            </span>
          </div>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            {members.map((m, i) => (
              <div
                key={i}
                style={{ display: "flex", alignItems: "center", gap: "10px" }}
              >
                <img
                  src={
                    m.avatar ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(m.userName)}&background=6366f1&color=fff&bold=true`
                  }
                  alt={m.userName}
                  style={{
                    width: "30px",
                    height: "30px",
                    borderRadius: "50%",
                    flexShrink: 0,
                    border: m.isSpeaking
                      ? "2px solid var(--green)"
                      : "2px solid transparent",
                    transition: "border-color 0.2s",
                  }}
                />
                <span
                  style={{
                    fontSize: "14px",
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color:
                      m.userId === user.id
                        ? "var(--accent-light)"
                        : "var(--text)",
                  }}
                >
                  {m.userName}
                  {m.userId?.toString() === room.host?.toString() && (
                    <span
                      style={{
                        fontSize: "10px",
                        color: "var(--accent-light)",
                        background: "var(--accent-glow)",
                        padding: "1px 6px",
                        borderRadius: "4px",
                        marginLeft: "6px",
                      }}
                    >
                      host
                    </span>
                  )}
                </span>
                <span
                  style={{
                    width: "7px",
                    height: "7px",
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: m.isSpeaking
                      ? "var(--green)"
                      : "var(--border2)",
                    transition: "background 0.2s",
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Live chat */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid var(--border)",
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: "13px", fontWeight: 700 }}>Live chat</span>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "14px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            {messages.length === 0 && (
              <p
                style={{
                  color: "var(--muted)",
                  fontSize: "13px",
                  textAlign: "center",
                  marginTop: "20px",
                }}
              >
                Chat is empty. Say something!
              </p>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className="fade-in">
                {msg.isSystem ? (
                  <p
                    style={{
                      fontSize: "12px",
                      color: "var(--muted)",
                      textAlign: "center",
                      fontStyle: "italic",
                    }}
                  >
                    {msg.message}
                  </p>
                ) : (
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        marginBottom: "4px",
                      }}
                    >
                      <img
                        src={
                          msg.avatar ||
                          `https://ui-avatars.com/api/?name=${encodeURIComponent(msg.userName)}&background=6366f1&color=fff&bold=true&size=24`
                        }
                        alt={msg.userName}
                        style={{
                          width: "18px",
                          height: "18px",
                          borderRadius: "50%",
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 600,
                          color:
                            msg.userName === user.name
                              ? "var(--accent-light)"
                              : "var(--text2)",
                        }}
                      >
                        {msg.userName}
                      </span>
                      <span
                        style={{
                          fontSize: "11px",
                          color: "var(--muted)",
                          marginLeft: "auto",
                        }}
                      >
                        {msg.time}
                      </span>
                    </div>
                    <p
                      style={{
                        fontSize: "14px",
                        color: "var(--text)",
                        paddingLeft: "24px",
                        lineHeight: 1.5,
                        wordBreak: "break-word",
                      }}
                    >
                      {msg.message}
                    </p>
                  </div>
                )}
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>

          <div
            style={{
              padding: "12px",
              borderTop: "1px solid var(--border)",
              display: "flex",
              gap: "8px",
              flexShrink: 0,
            }}
          >
            <input
              className="rw-input"
              placeholder="Say something..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendChat()}
              style={{ flex: 1, padding: "10px 14px", fontSize: "14px" }}
            />
            <button
              className="rw-btn rw-btn-primary"
              onClick={sendChat}
              style={{ padding: "10px 16px", fontSize: "16px" }}
            >
              ↑
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function toolBtn(color, bg, border) {
  return {
    background: bg,
    color,
    border: `1px solid ${border}`,
    borderRadius: "8px",
    padding: "7px 14px",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    whiteSpace: "nowrap",
  };
}

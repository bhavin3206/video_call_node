const socket = io();
let localStream;
let peerConnection;
const room = "room1"; // Example room name
const iceServers = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302", // Google's public STUN server
    },
  ],
};

const startBtn = document.getElementById("startBtn");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

startBtn.addEventListener("click", startCall);

// Get local media stream
async function startCall() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    localVideo.srcObject = localStream;

    // Create peer connection
    peerConnection = new RTCPeerConnection(iceServers);

    // Add local stream to the peer connection
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    // When remote stream is added
    peerConnection.ontrack = (event) => {
      remoteVideo.srcObject = event.streams[0];
    };

    // ICE candidate handling
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", event.candidate, room);
      }
    };

    // Join the room
    socket.emit("join-room", room);

    // Send offer to the other peer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit("offer", offer, room);
  } catch (error) {
    console.error("Error getting media:", error);
  }
}

// Listen for offer from other peer
socket.on("offer", async (offer) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit("answer", answer, room);
});

// Listen for answer from other peer
socket.on("answer", (answer) => {
  peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

// Listen for ICE candidates
socket.on("ice-candidate", (candidate) => {
  peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
});

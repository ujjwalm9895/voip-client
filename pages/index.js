import { useRef, useState } from 'react';

import Dreamboard from '../components/Dreamboard';

const SIGNAL_SERVER = 'wss://server-olzm.onrender.com/ws';
/
import useAISocket from '../hooks/useAISocket';


const AI_SOCKET = 'wss://server-olzm.onrender.com/ws-ai';

export default function Home() {
  const [username, setUsername] = useState('');
  const [peerName, setPeerName] = useState('');
  const [connected, setConnected] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [inCall, setInCall] = useState(false);
  const [muted, setMuted] = useState(false);
  const [timer, setTimer] = useState('00:00');
  const [images, setImages] = useState([]);

  const wsRef = useRef(null);
  const pcRef = useRef(null);
  const localAudioRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const localStreamRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const callStartTimeRef = useRef(null);
  const pendingCandidates = useRef([]);

  const { connectAISocket, sendAudio, closeAISocket } = useAISocket(setImages);

  const register = () => {
    if (!username) return;
    const socket = new WebSocket(`${SIGNAL_SERVER}/${username}`);
    wsRef.current = socket;

    socket.onopen = () => {
      setConnected(true);
    };

    socket.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'offer') {
        setIncomingCall(data.from);
        await setupWebRTC();
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.offer));
        for (const candidate of pendingCandidates.current) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        }
        pendingCandidates.current = [];
      }

      if (data.type === 'answer') {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
      }

      if (data.type === 'ice-candidate') {
        const candidate = new RTCIceCandidate(data.candidate);
        if (!pcRef.current?.remoteDescription) {
          pendingCandidates.current.push(data.candidate);
        } else {
          await pcRef.current.addIceCandidate(candidate);
        }
      }

      if (data.type === 'end-call') {
        cleanupCall();
        alert('Call ended');
      }
    };
  };

  const setupWebRTC = async () => {
    if (pcRef.current) return;
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    pcRef.current = pc;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStreamRef.current = stream;
    localAudioRef.current.srcObject = stream;
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        wsRef.current?.send(JSON.stringify({ type: 'ice-candidate', candidate: event.candidate }));
      }
    };
    pc.ontrack = (event) => {
      remoteAudioRef.current.srcObject = event.streams[0];
    };
    connectAISocket(stream);
  };

  const startCall = async () => {
    await setupWebRTC();
    const offer = await pcRef.current.createOffer();
    await pcRef.current.setLocalDescription(offer);
    wsRef.current.send(JSON.stringify({ type: 'offer', offer, to: peerName, from: username }));
    setInCall(true);
    startTimer();
  };

  const acceptCall = async () => {
    const answer = await pcRef.current.createAnswer();
    await pcRef.current.setLocalDescription(answer);
    wsRef.current.send(JSON.stringify({ type: 'answer', answer }));
    setIncomingCall(null);
    setInCall(true);
    startTimer();
  };

  const cleanupCall = () => {
    pcRef.current?.close();
    pcRef.current = null;
    setInCall(false);
    stopTimer();
    closeAISocket();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
  };

  const endCall = () => {
    wsRef.current?.send(JSON.stringify({ type: 'end-call' }));
    cleanupCall();
  };

  const startTimer = () => {
    callStartTimeRef.current = Date.now();
    timerIntervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - callStartTimeRef.current) / 1000);
      const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const seconds = String(elapsed % 60).padStart(2, '0');
      setTimer(`${minutes}:${seconds}`);
    }, 1000);
  };

  const stopTimer = () => {
    clearInterval(timerIntervalRef.current);
    setTimer('00:00');
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>VoIP + AI Dreamboard</h2>

      {!connected && (
        <div>
          <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <button onClick={register}>Register</button>
        </div>
      )}

      {connected && !inCall && (
        <div>
          <input placeholder="Call peer" value={peerName} onChange={(e) => setPeerName(e.target.value)} />
          <button onClick={startCall}>Call</button>
        </div>
      )}

      {incomingCall && (
        <div>
          <p>Incoming call from {incomingCall}</p>
          <button onClick={acceptCall}>Accept</button>
          <button onClick={cleanupCall}>Reject</button>
        </div>
      )}

      {inCall && (
        <div>
          <p>Call Time: {timer}</p>
          <button onClick={endCall}>End Call</button>
        </div>
      )}

      <div>
        <h3>Dreamboard (Live)</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          {images.map((url, idx) => (
            <img key={idx} src={url} alt="ai" style={{ width: 128, margin: 4 }} />
          ))}
        </div>
      </div>

      <audio ref={localAudioRef} autoPlay muted />
      <audio ref={remoteAudioRef} autoPlay />
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';

const SIGNAL_SERVER = 'wss://server-olzm.onrender.com/ws';

export default function Home() {
  const [username, setUsername] = useState('');
  const [peerName, setPeerName] = useState('');
  const [connected, setConnected] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [inCall, setInCall] = useState(false);
  const [muted, setMuted] = useState(false);
  const [timer, setTimer] = useState('00:00');
  const [callStartTime, setCallStartTime] = useState(null);

  const wsRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const localAudioRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const transcriptionSocketRef = useRef(null);

  const register = () => {
    const socket = new WebSocket(`${SIGNAL_SERVER}/${username}`);
    wsRef.current = socket;

    socket.onopen = () => setConnected(true);

    socket.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'offer') {
        setIncomingCall(data.from);
        await setupWebRTC();
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.offer));
      }

      if (data.type === 'answer') {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
      }

      if (data.type === 'ice-candidate') {
        if (pcRef.current) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      }
    };
  };

  const setupWebRTC = async () => {
    if (pcRef.current) return;

    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    pcRef.current = pc;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStreamRef.current = stream;
    localAudioRef.current.srcObject = stream;
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    startTranscription(stream);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        wsRef.current.send(JSON.stringify({ type: 'ice-candidate', candidate: e.candidate }));
      }
    };

    pc.ontrack = (event) => {
      remoteAudioRef.current.srcObject = event.streams[0];
    };
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

  const rejectCall = () => {
    cleanupCall();
    setIncomingCall(null);
  };

  const endCall = () => {
    cleanupCall();
  };

  const cleanupCall = () => {
    pcRef.current?.close();
    pcRef.current = null;
    stopTimer();
    setInCall(false);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }

    if (transcriptionSocketRef.current) {
      transcriptionSocketRef.current.close();
      transcriptionSocketRef.current = null;
    }
  };

  const toggleMute = () => {
    if (!localStreamRef.current) return;
    const track = localStreamRef.current.getAudioTracks()[0];
    track.enabled = !muted;
    setMuted(!muted);
  };

  const startTimer = () => {
    const start = Date.now();
    setCallStartTime(start);
    timerIntervalRef.current = setInterval(() => {
      const seconds = Math.floor((Date.now() - start) / 1000);
      const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
      const secs = String(seconds % 60).padStart(2, '0');
      setTimer(`${mins}:${secs}`);
    }, 1000);
  };

  const stopTimer = () => {
    clearInterval(timerIntervalRef.current);
    setTimer('00:00');
  };

  const startTranscription = (stream) => {
    const audioContext = new AudioContext({ sampleRate: 16000 });
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);

    const socket = new WebSocket('wss://your-backend.onrender.com/transcribe');
    transcriptionSocketRef.current = socket;

    socket.onmessage = (event) => {
      console.log('📝 Transcription:', event.data);
    };

    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      const pcm = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        pcm[i] = Math.max(-1, Math.min(1, input[i])) * 32767;
      }
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(pcm.buffer);
      }
    };

    source.connect(processor);
    processor.connect(audioContext.destination);
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>🔊 AI Voice Calling App</h2>

      {!connected && (
        <>
          <input placeholder="Your name" value={username} onChange={(e) => setUsername(e.target.value)} />
          <button onClick={register}>Register</button>
        </>
      )}

      {connected && !inCall && (
        <>
          <p>Welcome, {username}</p>
          <input placeholder="Peer name" value={peerName} onChange={(e) => setPeerName(e.target.value)} />
          <button onClick={startCall}>Call</button>
        </>
      )}

      {incomingCall && (
        <div>
          <p>📞 Incoming call from {incomingCall}</p>
          <button onClick={acceptCall}>Accept</button>
          <button onClick={rejectCall}>Reject</button>
        </div>
      )}

      {inCall && (
        <>
          <h4>🕒 Call Time: {timer}</h4>
          <button onClick={toggleMute}>{muted ? 'Unmute' : 'Mute'}</button>
          <button onClick={endCall}>End Call</button>
        </>
      )}

      <audio ref={localAudioRef} autoPlay muted />
      <audio ref={remoteAudioRef} autoPlay />
    </div>
  );
}

import { useRef, useState } from 'react';

const SIGNAL_SERVER = 'ws://192.168.29.51:8000/ws';

export default function Home() {
  const [username, setUsername] = useState('');
  const [peerName, setPeerName] = useState('');
  const [connected, setConnected] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [inCall, setInCall] = useState(false);
  const [muted, setMuted] = useState(false);
  const [timer, setTimer] = useState('00:00');

  const wsRef = useRef(null);
  const pcRef = useRef(null);
  const localAudioRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const localStreamRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const callStartTimeRef = useRef(null);
  const pendingCandidates = useRef([]);

  const register = () => {
    if (!username) return;
    const socket = new WebSocket(`${SIGNAL_SERVER}/${username}`);
    wsRef.current = socket;

    socket.onopen = () => {
      console.log('✅ WebSocket connected');
      setConnected(true);
    };

    socket.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'offer') {
        setIncomingCall(data.from);
        await setupWebRTC();
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.offer));

        // Add pending ICE candidates
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
          try {
            await pcRef.current.addIceCandidate(candidate);
          } catch (err) {
            console.error('❌ ICE add error:', err);
          }
        }
      }

      if (data.type === 'end-call') {
        cleanupCall();
        alert('📴 Call ended by the other user');
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
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        wsRef.current?.send(JSON.stringify({ type: 'ice-candidate', candidate: event.candidate }));
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
    alert('❌ Call Rejected');
  };

  const endCall = () => {
    try {
      wsRef.current?.send(JSON.stringify({ type: 'end-call' }));
    } catch (err) {
      console.warn('Could not notify peer:', err);
    }
    cleanupCall();
    alert('📴 You ended the call');
  };

  const cleanupCall = () => {
    pcRef.current?.close();
    pcRef.current = null;
    setInCall(false);
    stopTimer();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
  };

  const toggleMute = () => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    setMuted(!audioTrack.enabled);
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
      <h2>🔊 VoIP Calling App</h2>

      {!connected && (
        <div>
          <input
            placeholder="Your username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <button onClick={register}>Register</button>
        </div>
      )}

      {connected && (
        <>
          <p>✅ Registered as <strong>{username}</strong></p>
          {!inCall && (
            <>
              <input
                placeholder="Call peer"
                value={peerName}
                onChange={(e) => setPeerName(e.target.value)}
              />
              <button onClick={startCall}>Call</button>
            </>
          )}
        </>
      )}

      {incomingCall && !inCall && (
        <div style={{ marginTop: 20, border: '1px solid #ccc', padding: 10 }}>
          <p>📞 Incoming call from <strong>{incomingCall}</strong></p>
          <button onClick={acceptCall}>✅ Accept</button>
          <button onClick={rejectCall}>❌ Reject</button>
        </div>
      )}

      {inCall && (
        <div style={{ marginTop: 20 }}>
          <h4>🕒 Call Time: {timer}</h4>
          <button onClick={toggleMute}>{muted ? 'Unmute' : 'Mute'}</button>
          <button onClick={endCall}>End Call</button>
        </div>
      )}

      <div style={{ marginTop: 30 }}>
        <p>🎤 Local Audio</p>
        <audio ref={localAudioRef} autoPlay muted />
        <p>📞 Remote Audio</p>
        <audio ref={remoteAudioRef} autoPlay />
      </div>
    </div>
  );
}

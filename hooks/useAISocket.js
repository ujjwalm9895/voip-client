// hooks/useAISocket.js
import { useRef } from 'react';

const AI_SOCKET_URL = 'wss://server-olzm.onrender.com/ws-ai';

export default function useAISocket(setImages) {
  const socketRef = useRef(null);
  const mediaRecorderRef = useRef(null);

  const connectAISocket = async (stream) => {
    socketRef.current = new WebSocket(AI_SOCKET_URL);

    socketRef.current.onopen = () => {
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && socketRef.current.readyState === WebSocket.OPEN) {
          const arrayBuffer = await event.data.arrayBuffer();
          socketRef.current.send(arrayBuffer);
        }
      };

      mediaRecorder.start(3000); // send every 1 second
    };

    socketRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.image_url) {
        setImages((prev) => [...prev, data.image_url]);
      }
    };
  };

  const closeAISocket = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
  };

  return { connectAISocket, closeAISocket };
}
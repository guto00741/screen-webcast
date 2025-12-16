<template>
  <div class="app-container">

    <!-- TELA DE SELEÇÃO -->
    <div v-if="!mode" class="intro">
      <h1>⚡ Stream H.264 P2P</h1>
      <button @click="initSource" class="btn-source">💻 Transmitir (PC)</button>
      <p class="hint">Para receber, leia o QR Code gerado.</p>
    </div>

    <!-- MODO PC (SOURCE) -->
    <div v-if="mode === 'source'" class="source-view">
      <div class="header">
        <div class="status">
          Status:
          <span :style="{ color: isConnected ? '#4ff' : '#fa0' }">
            {{ isConnected ? 'Conectado (H.264)' : 'Aguardando Leitura...' }}
          </span>
        </div>
      </div>

      <div v-if="!isConnected" class="qr-box">
        <canvas ref="qrCanvas"></canvas>
        <p>Aponte a câmera do celular</p>
      </div>

      <div class="preview-box">
        <small>Sua Tela (Preview Local):</small>
        <video ref="localVideo" autoplay muted playsinline></video>
      </div>
    </div>

    <!-- MODO CELULAR (TARGET) -->
    <div v-if="mode === 'target'" class="target-view">
      <div v-if="!isConnected" class="loading-overlay">
        Conectando ao PC...
      </div>
      <video ref="remoteVideo" autoplay playsinline controls class="cinema-mode"></video>
    </div>

  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue';
import { io } from 'socket.io-client';
import SimplePeer from 'simple-peer';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';

// --- ESTADO ---
const mode = ref(null);
const roomId = ref('');
const isConnected = ref(false);
const localVideo = ref(null);
const remoteVideo = ref(null);
const qrCanvas = ref(null);

let socket = null;
let peer = null;

// --- MAGIA DO H.264 ---
// Esta função reescreve o texto de negociação (SDP) para priorizar H264
const forceCodec = (sdp, codecName) => {
  const lines = sdp.split('\n');
  const mLineIndex = lines.findIndex(l => l.startsWith('m=video'));
  if (mLineIndex === -1) return sdp;

  // Regex para achar o Payload ID do codec (ex: 96, 102, etc)
  const codecRegex = new RegExp(`a=rtpmap:(\\d+) ${codecName}/90000`);
  let payload = null;

  // Varre as linhas procurando o ID do H264
  for (const line of lines) {
    const match = line.match(codecRegex);
    if (match) {
      payload = match[1];
      break;
    }
  }

  if (!payload) {
    console.warn(`Codec ${codecName} não encontrado no SDP. Usando padrão.`);
    return sdp;
  }

  // Move o ID do H264 para o início da linha m=video
  const mLine = lines[mLineIndex];
  const elements = mLine.split(' ');

  // Formato: m=video <porta> <proto> <id1> <id2> ...
  const newMLine = [
    ...elements.slice(0, 3),
    payload, // Prioridade 1
    ...elements.slice(3).filter(id => id !== payload) // Resto
  ].join(' ');

  lines[mLineIndex] = newMLine;
  return lines.join('\n');
};

// --- INICIALIZAÇÃO ---
onMounted(() => {
  socket = io(); // Conecta no mesmo host

  const params = new URLSearchParams(window.location.search);
  const roomParam = params.get('room');

  if (roomParam) {
    initTarget(roomParam);
  }
});

// --- LÓGICA FONTE (PC) ---
const initSource = async () => {
  mode.value = 'source';
  roomId.value = uuidv4();

  try {
    // Solicita tela (Tente selecionar "Tela Cheia" ou "Janela" para melhor performance)
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: "always",
        frameRate: 60, // Tenta 60fps se hardware aguentar
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    });

    if (localVideo.value) localVideo.value.srcObject = stream;

    // Detecta se usuário parou de compartilhar
    stream.getVideoTracks()[0].onended = () => window.location.reload();

    socket.emit('join-room', roomId.value);
    generateQR();

    socket.on('peer-joined', () => {
      // Inicia conexão como Initiator
      createPeer(true, stream);
    });

    socket.on('signal', data => peer && peer.signal(data.signal));

  } catch (e) {
    console.error(e);
    mode.value = null;
  }
};

const generateQR = () => {
  const url = `${window.location.origin}?room=${roomId.value}`;
  nextTick(() => {
    QRCode.toCanvas(qrCanvas.value, url, { width: 256, margin: 1 }, err => {
      if (err) console.error(err);
    });
  });
};

// --- LÓGICA ALVO (CELULAR) ---
const initTarget = (id) => {
  mode.value = 'target';
  roomId.value = id;

  socket.emit('join-room', id);

  socket.on('signal', data => {
    if (!peer) createPeer(false, null);
    peer.signal(data.signal);
  });

  socket.on('peer-disconnected', () => {
    alert("Transmissão encerrada.");
    window.location.href = "/";
  });
};

// --- CRIAÇÃO DO PEER (COM H.264) ---
const createPeer = (initiator, stream) => {
  peer = new SimplePeer({
    initiator: initiator,
    trickle: false,
    stream: stream,
    // AQUI ESTÁ O TRUQUE:
    sdpTransform: (sdp) => {
      console.log("Aplicando filtro H.264...");
      return forceCodec(sdp, 'H264');
    },
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
      ]
    }
  });

  peer.on('signal', data => {
    socket.emit('signal', { signal: data, room: roomId.value });
  });

  peer.on('connect', () => {
    isConnected.value = true;
    console.log('Conexão P2P estabelecida com sucesso.');
  });

  peer.on('stream', remoteStream => {
    if (remoteVideo.value) remoteVideo.value.srcObject = remoteStream;
  });

  peer.on('error', err => console.error('Erro Peer:', err));
};
</script>

<style>
/* Estilos Cyberpunk/Dark */
body {
  margin: 0;
  background: #0f0f13;
  color: #fff;
  font-family: 'Segoe UI', sans-serif;
  overflow: hidden;
}

.app-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
}

.intro {
  text-align: center;
}

.btn-source {
  background: #7000ff;
  color: #fff;
  border: none;
  padding: 20px 40px;
  font-size: 1.5rem;
  border-radius: 12px;
  cursor: pointer;
  transition: 0.3s;
  box-shadow: 0 0 20px rgba(112, 0, 255, 0.4);
}

.btn-source:hover {
  background: #8a2be2;
  transform: scale(1.05);
}

.source-view {
  text-align: center;
  width: 100%;
  max-width: 600px;
}

.qr-box {
  background: white;
  padding: 10px;
  border-radius: 10px;
  display: inline-block;
  margin: 20px 0;
}

.qr-box p {
  color: #333;
  margin: 5px 0 0;
  font-weight: bold;
}

.preview-box video {
  width: 100%;
  border-radius: 8px;
  border: 1px solid #333;
  opacity: 0.5;
}

.target-view {
  width: 100%;
  height: 100vh;
  background: #000;
}

.cinema-mode {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.loading-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 1.5rem;
  color: #4ff;
}
</style>
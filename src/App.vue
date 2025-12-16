<template>
  <div class="app-container">
    
    <!-- TELA INICIAL: ESCOLHA DE MODO (Só aparece se não tiver ID na URL) -->
    <div v-if="!mode" class="selection-screen">
      <h1>WebCast P2P</h1>
      <p>Escolha o modo de operação:</p>
      <div class="buttons">
        <button @click="initSource" class="btn-primary">💻 Transmitir (PC)</button>
        <!-- O botão de receber é opcional, pois o celular entra via QR Code -->
      </div>
    </div>

    <!-- MODO FONTE (PC) -->
    <div v-if="mode === 'source'" class="source-screen">
      <div class="header">
        <h2>Transmitindo Tela</h2>
        <span class="status" :class="{ connected: isConnected }">
          {{ isConnected ? '● Celular Conectado' : '○ Aguardando Celular...' }}
        </span>
      </div>

      <div class="content">
        <!-- Área do QR Code -->
        <div v-if="!isConnected" class="qr-area">
          <canvas ref="qrCanvas"></canvas>
          <p>Aponte a câmera do celular para conectar</p>
        </div>

        <!-- Preview do Vídeo Local -->
        <div class="video-preview">
          <p>Sua visão:</p>
          <video ref="localVideo" autoplay muted playsinline></video>
        </div>
      </div>
    </div>

    <!-- MODO ALVO (CELULAR) -->
    <div v-if="mode === 'target'" class="target-screen">
      <div v-if="!isConnected" class="loading">
        <h2>Conectando...</h2>
        <p>Aguardando stream do PC</p>
      </div>
      <!-- Vídeo em tela cheia -->
      <video 
        ref="remoteVideo" 
        autoplay 
        playsinline 
        controls 
        class="fullscreen-video"
      ></video>
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
const mode = ref(null); // 'source' ou 'target'
const roomId = ref('');
const isConnected = ref(false);
const localVideo = ref(null);
const remoteVideo = ref(null);
const qrCanvas = ref(null);

let socket = null;
let peer = null;

// --- INICIALIZAÇÃO ---
onMounted(() => {
  // Conecta ao servidor (vazio = mesmo domínio/porta do site)
  socket = io();

  // Verifica se veio um Room ID na URL (Celular lendo QR)
  const params = new URLSearchParams(window.location.search);
  const roomParam = params.get('room');

  if (roomParam) {
    initTarget(roomParam);
  }
});

// --- LÓGICA DO PC (FONTE) ---
const initSource = async () => {
  mode.value = 'source';
  roomId.value = uuidv4(); // Gera ID único

  try {
    // 1. Pede permissão para gravar a tela
    const stream = await navigator.mediaDevices.getDisplayMedia({ 
      video: { cursor: "always" }, 
      audio: false 
    });

    // Mostra preview local
    await nextTick();
    if (localVideo.value) localVideo.value.srcObject = stream;

    // Se o usuário parar de compartilhar pelo navegador, encerra tudo
    stream.getVideoTracks()[0].onended = () => {
      alert("Compartilhamento encerrado");
      window.location.reload();
    };

    // 2. Entra na sala Socket
    socket.emit('join-room', roomId.value);

    // 3. Gera QR Code
    generateQRCode();

    // 4. Aguarda o celular entrar na sala
    socket.on('peer-joined', () => {
      createPeer(true, stream); // true = initiator (começa a conexão)
    });

    // Recebe resposta do celular
    socket.on('signal', (data) => {
      if (peer) peer.signal(data.signal);
    });

  } catch (err) {
    console.error("Erro ao capturar tela:", err);
    mode.value = null; // Volta pro inicio
  }
};

const generateQRCode = async () => {
  await nextTick();
  const url = `${window.location.origin}?room=${roomId.value}`;
  QRCode.toCanvas(qrCanvas.value, url, { width: 250, margin: 2 }, (error) => {
    if (error) console.error(error);
  });
};

// --- LÓGICA DO CELULAR (ALVO) ---
const initTarget = (id) => {
  mode.value = 'target';
  roomId.value = id;

  socket.emit('join-room', roomId.value);

  socket.on('signal', (data) => {
    // Se o peer ainda não existe, cria (passivo)
    if (!peer) createPeer(false, null);
    peer.signal(data.signal);
  });
  
  // O PC pode desconectar
  socket.on('peer-disconnected', () => {
    alert("O PC desconectou.");
    window.location.href = "/";
  });
};

// --- WEBRTC (COMUM AOS DOIS) ---
const createPeer = (initiator, stream) => {
  peer = new SimplePeer({
    initiator: initiator,
    trickle: false, // Simples, espera coletar todos candidatos ICE antes de enviar
    stream: stream,
    config: { 
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
      ] 
    }
  });

  peer.on('signal', (data) => {
    socket.emit('signal', {
      signal: data,
      room: roomId.value
    });
  });

  peer.on('connect', () => {
    console.log('P2P Conectado!');
    isConnected.value = true;
  });

  peer.on('stream', (remoteStream) => {
    if (mode.value === 'target' && remoteVideo.value) {
      remoteVideo.value.srcObject = remoteStream;
    }
  });
  
  peer.on('error', err => console.error('Peer error:', err));
};
</script>

<style>
/* CSS Reset básico */
body { margin: 0; padding: 0; font-family: sans-serif; background: #1a1a1a; color: white; }

.app-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  text-align: center;
}

/* Tela de Seleção */
.selection-screen button {
  padding: 15px 30px;
  font-size: 1.2rem;
  background: #42b883;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  margin-top: 20px;
}

/* Modo PC */
.source-screen { width: 100%; max-width: 800px; padding: 20px; }
.status { font-weight: bold; color: #ffcc00; }
.status.connected { color: #42b883; }

.content { margin-top: 20px; display: flex; flex-direction: column; align-items: center; gap: 20px;}
.video-preview video { width: 100%; max-width: 400px; border: 2px solid #333; border-radius: 8px; }
canvas { border-radius: 10px; }

/* Modo Mobile */
.target-screen { width: 100%; height: 100vh; background: black; display: flex; align-items: center; justify-content: center; }
.fullscreen-video { width: 100%; height: 100%; object-fit: contain; }
.loading { position: absolute; z-index: 10; text-align: center; }
</style>
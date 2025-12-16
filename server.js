const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// Configuração básica do Express
const app = express();
app.use(cors()); // Libera acesso para seu Frontend (Vue) hospedado em outro lugar

// Rota de saúde (apenas para testar se o servidor está online no navegador)
app.get('/', (req, res) => {
    res.send('Servidor de Sinalização WebRTC está rodando! 🚀');
});

const server = http.createServer(app);

// Configuração do Socket.io
const io = new Server(server, {
    cors: {
        origin: "*", // Em produção, você pode trocar '*' pela URL do seu Vercel para mais segurança
        methods: ["GET", "POST"]
    }
});

io.on('connection', (socket) => {
    console.log(`Nova conexão: ${socket.id}`);

    // Evento 1: Entrar na sala (Disparado pelo PC ao criar e pelo Celular ao ler QR)
    socket.on('join-room', (roomId) => {
        // O socket entra na "sala" específica do Token/UUID
        socket.join(roomId);
        
        // Salva o ID da sala no objeto do socket para usar no disconnect
        socket.roomId = roomId;

        console.log(`Socket ${socket.id} entrou na sala: ${roomId}`);

        // Avisa a todos na sala (exceto quem entrou) que há um novo par
        // Isso serve para avisar o PC que o Celular chegou
        socket.to(roomId).emit('peer-joined', socket.id);
    });

    // Evento 2: Sinalização WebRTC (Offer, Answer, ICE Candidates)
    // O servidor apenas repassa a mensagem de A para B dentro da mesma sala
    socket.on('signal', (data) => {
        // data deve ser: { room: 'ID-DA-SALA', signal: { ...dados do webrtc... } }
        
        console.log(`Sinal recebido de ${socket.id} na sala ${data.room}`);
        
        // Envia para todos na sala, EXCETO quem enviou
        socket.to(data.room).emit('signal', {
            signal: data.signal,
            from: socket.id
        });
    });

    // Evento 3: Desconexão
    socket.on('disconnect', () => {
        if (socket.roomId) {
            console.log(`Socket ${socket.id} saiu da sala ${socket.roomId}`);
            // Avisa o outro lado para fechar o vídeo se quiser
            socket.to(socket.roomId).emit('peer-disconnected', socket.id);
        }
    });
});

// Pega a porta do ambiente (Render) ou usa a 3000 localmente
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
});
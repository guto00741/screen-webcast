const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());

// Define a pasta 'dist' (build do Vue) como pública
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" },
    // Aumenta o buffer para evitar desconexões em streams pesados
    maxHttpBufferSize: 1e8 
});

io.on('connection', (socket) => {
    console.log(`🔌 Nova conexão: ${socket.id}`);

    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        socket.roomId = roomId; // Salva na sessão
        // Avisa quem já está na sala que chegou alguém novo
        socket.to(roomId).emit('peer-joined', socket.id);
    });

    socket.on('signal', (data) => {
        // Repassa os dados WebRTC (SDP/ICE) para o outro peer da sala
        socket.to(data.room).emit('signal', {
            signal: data.signal,
            from: socket.id
        });
    });

    socket.on('disconnect', () => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('peer-disconnected');
        }
    });
});

// Rota "Catch-All": Qualquer URL que não seja API vai pro Vue (SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT} (H.264 Priority)`);
});
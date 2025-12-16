const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

// 1. Diga ao Express para servir os arquivos estáticos da pasta 'dist'
app.use(express.static(path.join(__dirname, 'dist')));

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" } 
});

io.on('connection', (socket) => {
    console.log(`Nova conexão: ${socket.id}`);

    // --- Mesma lógica de antes ---
    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        socket.roomId = roomId;
        socket.to(roomId).emit('peer-joined', socket.id);
    });

    socket.on('signal', (data) => {
        socket.to(data.room).emit('signal', {
            signal: data.signal,
            from: socket.id
        });
    });

    socket.on('disconnect', () => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('peer-disconnected', socket.id);
        }
    });
});

// 2. Rota "Coringa": Qualquer requisição que não seja API/Socket, manda o index.html
// Isso permite que o Vue funcione (mesmo se você usar Vue Router no futuro)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✅ Servidor + Vue rodando na porta ${PORT}`);
});
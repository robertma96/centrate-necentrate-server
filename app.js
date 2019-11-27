const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const port = process.env.PORT || 4001;
const index = require('./routes/index');

const app = express();
app.use(index);

const server = http.createServer(app);

const io = socketIo(server);

let activeUsers = 0;

const getApiAndEmit = async socket => {
    try {
        socket.emit("activeUsers", activeUsers); // Emitting a new message. It will be consumed by the client
    } catch (error) {
        console.error(`Error: ${error.code}`);
    }
};

io.on("connection", socket => {
    console.log("Client connected " + socket.id);

    activeUsers += 1;

    setInterval(() => getApiAndEmit(socket), 1000);

    socket.on("disconnect", () => {
        console.log("Client disconnected " + socket.id);
        activeUsers -= 1;
    });
});

let players = {};
let matched = null;

function joinGame(socket) {
    // Add the player to our object of players
    players[socket.id] = {
        // The opponent will either be the socket that is
        // currently unmatched, or it will be null if no
        // players are unmatched
        opponent: matched,

        // First to connect starts
        myTurn: true,

        // The socket that is associated with this player
        socket: socket,

        myNumber: null,

        guessedNumber: null
    };
    if (!matched) {
        matched = socket.id;
    } else {
        players[socket.id].myTurn = false;
        players[matched].opponent = socket.id;
        matched = null;
    }
}

// Returns the opponent socket
function getOpponent(socket) {
    if (!players[socket.id].opponent) {
        return;
    }

    return players[players[socket.id].opponent].socket;
}

io.on("connection", socket => {
    socket.on('set.number', data => {
        joinGame(socket);

        // Once the socket has an opponent, we can begin the game
        if (getOpponent(socket)) {
            socket.emit("game.begin", {
                myTurn: players[socket.id].myTurn
            });

            getOpponent(socket).emit("game.begin", {
                myTurn: players[getOpponent(socket).id].myTurn
            });
        }
        players[socket.id].myNumber = data.myNumber;
        // Listens for a move to be made and emits an event to both
        // players after the move is completed
        socket.on("make.move", data => {
            if (!getOpponent(socket)) {
                return;
            }

            players[getOpponent(socket).id].guessedNumber = data.guessedNumber;

            const opponentNumber = players[getOpponent(socket).id].myNumber;
            let guessedNumber = data.guessedNumber;

            if (opponentNumber === guessedNumber) {
                socket.emit('gameEnds', {message: "You won."});
                getOpponent(socket).emit("gameEnds", {message: "You lost."});
            } else {
                let centrate = 0, necentrate = 0;
                let guessedNumberString = guessedNumber.toString();
                let opponentNumberString = opponentNumber.toString();

                for (let i = 0; i < guessedNumberString.length; i++) {
                    for (let j = 0; j <= opponentNumberString.length; j++) {
                        if (guessedNumberString.charAt(i) === opponentNumberString.charAt(j) && i === j) {
                            centrate = centrate + 1;
                        } else if (guessedNumber.charAt(i) === opponentNumberString.charAt(j) && i!==j) {
                            necentrate = necentrate + 1;
                        }
                    }
                }
                socket.emit('found.values', {foundValuesMessage: `${centrate} centrate ${necentrate} necentrate`});
                centrate = 0;
                necentrate = 0;
            }

            socket.emit("move.made", data);
            getOpponent(socket).emit("move.made", data);
        });

        // Emit an event to the opponent when the player leaves
        socket.on("disconnect", () => {
            if (getOpponent(socket)) {
                getOpponent(socket).emit("opponent.left");
                players[players[socket.id].opponent].opponent = null;
                joinGame(getOpponent(socket));
                delete players[socket.id];
            } else {
                matched = null;
                delete players[socket.id];
            }
        });
    });


});


server.listen(port, () => console.log(`Listening on port ${port}`));
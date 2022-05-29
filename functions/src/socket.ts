import {Server} from "socket.io";
import * as admin from "firebase-admin";
import {logger} from "firebase-functions";

async function verifyToken(token: string): Promise<any | undefined> {
    try {
        const payload: admin.auth.DecodedIdToken =
            await admin.auth().verifyIdToken(token);
        if (payload !== null) {
            return payload;
        }
        return undefined;
    } catch (err) {
        return undefined;
    }
}

export function setUpAuth(io: Server) {
    io.use(async (socket, next) => {
        logger.debug(socket.handshake);
        if ((socket.handshake.auth && socket.handshake.auth.token) || socket.handshake.headers.token) {
            logger.debug("Got some socket token");
            const user = await verifyToken(
                (socket.handshake.auth && socket.handshake.auth.token) ?
                    socket.handshake.auth.token : socket.handshake.headers.token);

            if (user) {
                logger.debug("Logged");
                socket.data = {socket: socket, user: user};
                next();
            } else {
                next(new Error("Need to be authentified."));
            }
        } else {
            next(new Error("Need to be authentified"));
        }
    });
}

export function setUpSocket(server: any): Server {
    const io = new Server(server, {
        cors: {
            origin: "*",
        },
    });
    setUpAuth(io);
    return io;
}
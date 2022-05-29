import {isConnectedMiddleware} from "./helpers";
import {FieldValue} from "firebase-admin/firestore";
import {firestore} from "firebase-admin";
import {Express} from "express";
import {logger} from "firebase-functions";
import {checkChatRoomExist, sendMessage} from "./messages";
import {Server, Socket} from "socket.io";

function chatWebSocket(io: Server, db: firestore.Firestore) {
    io.on("connection", async (socket: Socket) => {
        if (socket.data && socket.data.user && socket.data.user.uid) {
            socket.join(socket.data.user.uid);
        }

        socket.on("listenChat", async (roomName: string, callback) => {
            if (await checkChatRoomExist(db, roomName)) {
                socket.join(roomName);
                callback("Listen chat.");
            } else {
                callback("This chat don't exist.");
            }
        });

        socket.on("stopListenChat", async (roomName: string, callback) => {
            if (await checkChatRoomExist(db, roomName)) {
                socket.leave(roomName);
                callback("Stop listen chat.");
            } else {
                callback("This chat don't exist.");
            }
        });
    });
}

export function initChatsRoutes(app: Express, db: firestore.Firestore, io: Server) {
    const baseUrl = "/chats";

    chatWebSocket(io, db);

    app.post(baseUrl,
        (req: any, res: any, next: any) =>
            isConnectedMiddleware(req, res, next, db, false),
        async (request: any, response: any) => {
            if (!(request.body && request.body.name)) {
                response.status(400).json({message: "Need a name."});
            }

            if ((await db.collection("Chats").doc(request.body.name).get()).exists) {
                response.status(400).json({message: "This chat already exist."});
            }

            db.collection("Chats").doc(request.body.name).set({
                user: [request.user.uid],
                lastUpdate: FieldValue.serverTimestamp(),
            }).then((_value) => {
                response.status(201).json({message: "Chat created."});

                io.in(request.user.uid).emit("joinChat", request.params.chatName);

                try {
                    sendMessage(db, request.params.chatName, "Chat created.", request.user.uid, io, true, false);
                } catch (err: any) {
                    return;
                }
            }).catch((err: any) => {
                logger.error(err);
                response.status(400).json({message: err.details});
            });
        }
    );

    app.get(baseUrl,
        (req: any, res: any, next: any) =>
            isConnectedMiddleware(req, res, next, db, false),
        (_request: any, response: any) => {
            db.collection("Chats")
                .orderBy("lastUpdate", "desc")
                .get()
                .then((value: firestore.QuerySnapshot<firestore.DocumentData>) => {
                    const responseValue: any[] = [];

                    value.forEach((doc) => {
                        const toReturn = doc.data();
                        toReturn.name = doc.id;
                        responseValue.push(toReturn);
                    });
                    response.status(200).json(responseValue);
                })
                .catch((err: any) => {
                    logger.error(err);
                    response.status(400).json({message: err.details});
                });
        }
    );

    app.get(baseUrl + "/mine",
        (req: any, res: any, next: any) =>
            isConnectedMiddleware(req, res, next, db, false),
        (request: any, response: any) => {
            db.collection("Chats")
                .where("user", "array-contains", request.user.uid)
                .orderBy("lastUpdate", "desc")
                .get()
                .then((value: firestore.QuerySnapshot<firestore.DocumentData>) => {
                    const responseValue: any[] = [];

                    value.forEach((doc) => {
                        const toReturn = doc.data();
                        toReturn.name = doc.id;
                        responseValue.push(toReturn);
                    });
                    response.status(200).json(responseValue);
                })
                .catch((err: any) => {
                    logger.error(err);
                    response.status(400).json({message: err.details});
                });
        }
    );

    app.put(baseUrl + "/join/:chatName",
        (req: any, res: any, next: any) =>
            isConnectedMiddleware(req, res, next, db, false),
        async (request: any, response: any) => {
            if (!(request.params && request.params.chatName)) {
                response.status(400).json({message: "Need the chat name."});
            }

            const docRef = db.collection("Chats").doc(request.params.chatName);

            const docDataGet = await docRef.get();

            if (!(docDataGet.exists)) {
                response.status(400).json({message: "This chat don't exist."});
            }

            const docData = docDataGet.data();

            if (docData && docData.user.find((element: string) => element === request.user.uid)) {
                response.status(400).json({message: "Already present in this chat."});
            }

            docRef.update({
                user: FieldValue.arrayUnion(request.user.uid),
            }).then((_value: any) => {
                response.status(200).json({message: "Join chat."});

                io.in(request.user.uid).emit("joinChat", request.params.chatName);

                try {
                    sendMessage(db, request.params.chatName, "User " + request.user.uid + " join the chat.", request.user.uid, io, true, true);
                } catch (err: any) {
                    return;
                }
            }).catch((err: any) => {
                logger.error(err);
                response.status(400).json({message: err.details});
            });
        }
    );

    app.put(baseUrl + "/leave/:chatName",
        (req: any, res: any, next: any) =>
            isConnectedMiddleware(req, res, next, db, false),
        async (request: any, response: any) => {
            if (!(request.params && request.params.chatName)) {
                response.status(400).json({message: "Need the chat name."});
            }

            const docRef = db.collection("Chats").doc(request.params.chatName);

            const docDataGet = await docRef.get();

            if (!(docDataGet.exists)) {
                response.status(400).json({message: "This chat don't exist."});
            }

            const docData = docDataGet.data();

            if (docData && !docData.user.find((element: string) => element === request.user.uid)) {
                response.status(400).json({message: "Not present in this chat."});
            }

            docRef.update({
                user: FieldValue.arrayRemove(request.user.uid),
            }).then((_value: any) => {
                response.status(200).json({message: "Leave chat."});

                io.in(request.user.uid).socketsLeave(request.params.chatName);
                io.in(request.user.uid).emit("leaveChat", request.params.chatName);

                try {
                    sendMessage(db, request.params.chatName, "User " + request.user.uid + " leave the chat.", request.user.uid, io, true, true);
                } catch (err: any) {
                    return;
                }
            }).catch((err: any) => {
                logger.error(err);
                response.status(400).json({message: err.details});
            });
        }
    );
}
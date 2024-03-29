import {isConnectedMiddleware} from "./helpers";
import {FieldValue} from "firebase-admin/firestore";
import {firestore} from "firebase-admin";
import {Express} from "express";
import {logger} from "firebase-functions";
import {checkChatRoomExistMiddleware, sendMessage} from "./messages";
import {Storage} from "firebase-admin/storage";

export function initChatsRoutes(app: Express, db: firestore.Firestore, storage: Storage) {
    const baseUrl = "/chats";

    app.post(baseUrl,
        (req: any, res: any, next: any) =>
            isConnectedMiddleware(req, res, next, db, false),
        async (request: any, response: any) => {
            if (!(request.body && request.body.name)) {
                response.status(400).json({message: "Need a name."});
                return;
            }

            if ((await db.collection("Chats").doc(request.body.name).get()).exists) {
                response.status(400).json({message: "This chat already exist."});
                return;
            }

            db.collection("Chats").doc(request.body.name).set({
                user: [request.user.uid],
                lastUpdate: FieldValue.serverTimestamp(),
                creator: request.user.uid,
            }).then((_value) => {
                response.status(201).json({message: "Chat created."});

                try {
                    sendMessage(db, request.params.chatName, "Chat created.", request.user.uid, request.user.email, true, false);
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
                return;
            }

            const docRef = db.collection("Chats").doc(request.params.chatName);

            const docDataGet = await docRef.get();

            if (!(docDataGet.exists)) {
                response.status(400).json({message: "This chat don't exist."});
                return;
            }

            const docData = docDataGet.data();

            if (docData && docData.user.find((element: string) => element === request.user.uid)) {
                response.status(400).json({message: "Already present in this chat."});
                return;
            }

            docRef.update({
                user: FieldValue.arrayUnion(request.user.uid),
            }).then((_value: any) => {
                response.status(200).json({message: "Join chat."});

                try {
                    sendMessage(db, request.params.chatName, "User " + request.user.uid + " join the chat.", request.user.uid, request.user.email, true, true);
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
                return;
            }

            const docRef = db.collection("Chats").doc(request.params.chatName);

            const docDataGet = await docRef.get();

            if (!(docDataGet.exists)) {
                response.status(400).json({message: "This chat don't exist."});
                return;
            }

            const docData = docDataGet.data();

            if (docData && !docData.user.find((element: string) => element === request.user.uid)) {
                response.status(400).json({message: "Not present in this chat."});
                return;
            }

            docRef.update({
                user: FieldValue.arrayRemove(request.user.uid),
            }).then((_value: any) => {
                response.status(200).json({message: "Leave chat."});

                try {
                    sendMessage(db, request.params.chatName, "User " + request.user.uid + " leave the chat.", request.user.uid, request.user.email, true, true);
                } catch (err: any) {
                    return;
                }
            }).catch((err: any) => {
                logger.error(err);
                response.status(400).json({message: err.details});
            });
        }
    );

    app.delete(baseUrl + "/:chatName",
        (req: any, res: any, next: any) =>
            isConnectedMiddleware(req, res, next, db, false),
        (req: any, res: any, next: any) =>
            checkChatRoomExistMiddleware(req, res, next, db),
        async (request: any, response: any) => {
            const docRef = db.collection("Chats").doc(request.params.chatName);

            const docDataGet = await docRef.get();

            const docData = docDataGet.data();

            if (docData && docData.creator !== request.user.uid) {
                response.status(400).json({message: "You are not the creator of this chat."});
                return;
            }

            docRef.delete().then(async (_value: any) => {
                await storage.bucket().deleteFiles({prefix: request.params.chatName});
                response.status(200).json({message: "Delete chat."});
            }).catch((err: any) => {
                logger.error(err);
                response.status(400).json({message: err.details});
            });
        }
    );
}
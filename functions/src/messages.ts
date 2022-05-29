import {isConnectedMiddleware} from "./helpers";
import {FieldValue} from "firebase-admin/firestore";
import {firestore} from "firebase-admin";
import {Express} from "express";
import {logger} from "firebase-functions";

export async function checkChatRoomExist(db: firestore.Firestore, name: string) {
    if ((await db.collection("Chats").doc(name).get()).exists) {
        return true;
    }
    return false;
}

async function checkChatRoomExistMiddleware(req: any, res: any, next: any, db: firestore.Firestore) {
    if (!(req.params && req.params.chatName)) {
        req.status(400).json({message: "Need the chat name."});
    }

    if (await checkChatRoomExist(db, req.params.chatName)) {
        next();
    } else {
        res.status(400).json({message: "This chat don't exist."});
    }
}

async function checkUserIsInChatMiddleware(req: any, res: any, next: any, db: firestore.Firestore) {
    const dataRef = await db.collection("Chats").doc(req.params.chatName).get();
    const data = dataRef.data();

    if (data && data.user.find((element: string) => element === req.user.uid)) {
        next();
    } else {
        res.status(400).json({message: "You need to join this chat."});
    }
}

export async function sendMessage(
    db: firestore.Firestore,
    chatName: string,
    message: string,
    uid: string,
    systemMessage = false,
    updateLastUpdate = true
) {
    await db.collection("Chats").doc(chatName).collection("Messages").add({
        message: message,
        user: uid,
        createdAt: FieldValue.serverTimestamp(),
        systemMessage: systemMessage,
    });
    if (updateLastUpdate) {
        await db.collection("Chats").doc(chatName).update({
            lastUpdate: FieldValue.serverTimestamp(),
        });
    }
}

export function initMessagesRoutes(app: Express, db: firestore.Firestore) {
    const baseUrl = "/chats/:chatName/messages";

    app.get(baseUrl,
        (req: any, res: any, next: any) =>
            isConnectedMiddleware(req, res, next, db, false),
        (req: any, res: any, next: any) =>
            checkChatRoomExistMiddleware(req, res, next, db),
        (req: any, res: any, next: any) =>
            checkUserIsInChatMiddleware(req, res, next, db),
        async (request: any, response: any) => {
            db.collection("Chats").doc(request.params.chatName).collection("Messages")
                .orderBy("createdAt", "desc")
                .get()
                .then((value: firestore.QuerySnapshot<firestore.DocumentData>) => {
                    const responseValue: any[] = [];

                    value.forEach((doc) => {
                        const toReturn = doc.data();
                        toReturn.id = doc.id;
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

    app.post(baseUrl,
        (req: any, res: any, next: any) =>
            isConnectedMiddleware(req, res, next, db, false),
        (req: any, res: any, next: any) =>
            checkChatRoomExistMiddleware(req, res, next, db),
        (req: any, res: any, next: any) =>
            checkUserIsInChatMiddleware(req, res, next, db),
        (request: any, response: any) => {
            if (!(request.body && request.body.message)) {
                response.status(400).json({message: "Need a message."});
            }

            sendMessage(db, request.params.chatName, request.body.message, request.user.uid)
                .then((_value) => {
                    response.status(201).json({message: "Message send."});
                }).catch((err: any) => {
                    logger.error(err);
                    response.status(400).json({message: err.details});
                });
        }
    );
}
import { isConnectedMiddleware } from "./helpers";
import { FieldValue } from "firebase-admin/firestore";
import { firestore } from "firebase-admin";
import { Express } from "express";
import { logger } from "firebase-functions";

export function initChatsRoutes(app: Express, db: firestore.Firestore) {
    const baseUrl = "/chats";

    app.post(baseUrl,
        (req: any, res: any, next: any) =>
            isConnectedMiddleware(req, res, next, db, false),
        async (request: any, response: any) => {
            if (!(request.body && request.body.name)) {
                response.status(400).json({ message: "Need a name." });
            }

            if ((await db.collection("Chats").doc(request.body.name).get()).exists) {
                response.status(400).json({ message: "This chat already exist." });
            }

            db.collection("Chats").doc(request.body.name).set({
                user: [request.user.uid],
                lastUpdate: FieldValue.serverTimestamp(),
            }).then((_value) => {
                response.status(201).json({ message: "Chat created." });
            }).catch((err: any) => {
                logger.error(err);
                response.status(400).json({ message: err.details });
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
                        responseValue.push(doc.data());
                    });
                    response.status(200).json(responseValue);
                })
                .catch((err: any) => {
                    logger.error(err);
                    response.status(400).json({ message: err.details });
                });
        }
    );

    app.get(baseUrl + "/mine",
        (req: any, res: any, next: any) =>
            isConnectedMiddleware(req, res, next, db, false),
        (request: any, response: any) => {
            db.collection("Chats")
                .where("user", "in", [request.user.uid])
                .orderBy("lastUpdate", "desc")
                .get()
                .then((value: firestore.QuerySnapshot<firestore.DocumentData>) => {
                    const responseValue: any[] = [];

                    value.forEach((doc) => {
                        responseValue.push(doc.data());
                    });
                    response.status(200).json(responseValue);
                })
                .catch((err: any) => {
                    logger.error(err);
                    response.status(400).json({ message: err.details });
                });
        }
    );

    app.put(baseUrl + "/join/:chatName",
        (req: any, res: any, next: any) =>
            isConnectedMiddleware(req, res, next, db, false),
        (request: any, response: any) => {
            if (!(request.params && request.params.chatName)) {
                response.status(400).json({ message: "Need the chat name." });
            }

            db.collection("Chats").doc(request.params.chatName).update({
                user: FieldValue.arrayUnion(request.user.uid),
            }).then((_value: any) => {
                response.status(200).json({ message: "Join chat." });
            }).catch((err: any) => {
                logger.error(err);
                response.status(400).json({ message: err.details });
            });
        }
    );

    app.put(baseUrl + "/leave/:chatName",
        (req: any, res: any, next: any) =>
            isConnectedMiddleware(req, res, next, db, false),
        (request: any, response: any) => {
            if (!(request.params && request.params.chatName)) {
                response.status(400).json({ message: "Need the chat name." });
            }

            db.collection("Chats").doc(request.params.chatName).update({
                user: FieldValue.arrayRemove(request.user.uid),
            }).then((_value: any) => {
                response.status(200).json({ message: "Leave chat." });
            }).catch((err: any) => {
                logger.error(err);
                response.status(400).json({ message: err.details });
            });
        }
    );
}
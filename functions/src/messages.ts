import {isConnectedMiddleware} from "./helpers";
import {FieldValue} from "firebase-admin/firestore";
import {firestore} from "firebase-admin";
import {Express} from "express";
import {logger} from "firebase-functions";
import {Storage} from "firebase-admin/storage";

import * as busboyC from "busboy";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

export async function checkChatRoomExist(db: firestore.Firestore, name: string) {
    if ((await db.collection("Chats").doc(name).get()).exists) {
        return true;
    }
    return false;
}

export async function checkChatRoomExistMiddleware(req: any, res: any, next: any, db: firestore.Firestore) {
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
    updateLastUpdate = true,
    filepath = ""
) {
    await db.collection("Chats").doc(chatName).collection("Messages").add({
        message: message,
        user: uid,
        createdAt: FieldValue.serverTimestamp(),
        systemMessage: systemMessage,
        filepath: filepath,
    });
    if (updateLastUpdate) {
        await db.collection("Chats").doc(chatName).update({
            lastUpdate: FieldValue.serverTimestamp(),
        });
    }
}

export function initMessagesRoutes(app: Express, db: firestore.Firestore, storage: Storage) {
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
                return;
            }

            sendMessage(db, request.params.chatName, request.body.message, request.user.uid)
                .then((_value) => {
                    response.status(201).json({message: "Message send."});
                }).catch((err: any) => {
                    logger.error(err);
                    if (err.details) {
                        response.status(400).json({message: err.details});
                    } else {
                        response.status(400).json({message: err.message});
                    }
                });
        }
    );

    app.post(baseUrl + "/file", (req: any, res: any, next: any) =>
        isConnectedMiddleware(req, res, next, db, false),
    (req: any, res: any, next: any) =>
        checkChatRoomExistMiddleware(req, res, next, db),
    (req: any, res: any, next: any) =>
        checkUserIsInChatMiddleware(req, res, next, db),
    (req: any, res: any) => {
        if (!req.is("multipart/form-data")) {
            res.status(400).json({message: "This request is not a multipart/form-data."});
        }

        const busboy = busboyC({
            headers: req.headers, limits: {
                fields: 0,
                files: 1,
                fileSize: 10 * 1024 * 1024,
            },
        });
        const tmpdir = os.tmpdir();

        let upload: any = undefined;

        const fileWrites: any[] = [];

        busboy.on("file", (fieldname: string, file: any, {filename, encoding, mimeType}: any) => {
            logger.debug("File [" + fieldname + "]: filename: " + filename + ", encoding: " + encoding + ", mimetype: " + mimeType);
            if (mimeType !== "image/gif" && mimeType !== "image/png" && mimeType !== "image/jpeg") {
                busboy.emit("error", new Error("Only accept GIF, PNG, JPEG."));
                return;
            }

            const filepath = path.join(tmpdir, filename);
            upload = {filepath: filepath, filename: filename};

            const writeStream = fs.createWriteStream(filepath);
            file.pipe(writeStream);

            const promise = new Promise((resolve, reject) => {
                file.on("end", () => {
                    writeStream.end();
                });
                writeStream.on("finish", resolve);
                writeStream.on("error", reject);
            });
            fileWrites.push(promise);
        });

        busboy.on("filesLimit", function() {
            res.status(400).json({message: "Too much file."});
        });

        busboy.on("error", function(err: any) {
            logger.debug(err.message);
            res.status(400).json({message: err.message});
        });

        busboy.on("finish", async () => {
            await Promise.all(fileWrites);

            try {
                if (upload) {
                    await sendFile(req, res, upload, storage, db);
                } else {
                    res.status(400).json({message: "Don't have file"});
                }
            } catch (err: any) {
                logger.error(err);
                res.status(400).json({message: "This file don't exist."});
            }
        });
        busboy.end(req.rawBody);
    });

    app.get(baseUrl + "/file/:fileName", (req: any, res: any, next: any) =>
        isConnectedMiddleware(req, res, next, db, false),
    (req: any, res: any, next: any) =>
        checkChatRoomExistMiddleware(req, res, next, db),
    (req: any, res: any, next: any) =>
        checkUserIsInChatMiddleware(req, res, next, db),
    async (req: any, res: any) => {
        if (!req.params.chatName) {
            res.status(400).json({message: "Need a message."});
            return;
        }

        const filepath = path.join(os.tmpdir(), req.params.fileName);

        const exist = await storage.bucket().file(req.params.chatName + "/" + req.params.fileName).exists();

        if (!exist[0]) {
            res.status(400).json({message: "This file don't exist."});
            return;
        }

        try {
            const result = await storage.bucket()
                .file(req.params.chatName + "/" + req.params.fileName)
                .download({destination: filepath});
            logger.debug(result);
            res.download(filepath, function(error: any) {
                if (error) {
                    logger.debug(error);
                } else {
                    fs.unlinkSync(filepath);
                }
            });
        } catch (err: any) {
            logger.error(err);
            res.status(400).json(err.message);
            return;
        }
    });
}

async function sendFile(req: any, res: any, upload: any, storage: Storage, db: any) {
    await storage.bucket().upload(upload.filepath, {
        resumable: false,
        gzip: true,
        destination: req.params.chatName + "/" + upload.filename,
    });
    fs.unlinkSync(upload.filepath);
    sendMessage(db, req.params.chatName, "", req.user.uid, false, true, upload.filename)
        .then((_value) => {
            res.status(201).json({message: "File send."});
        }).catch((err: any) => {
            logger.error(err);
            if (err.details) {
                res.status(400).json({message: err.details});
            } else {
                res.status(400).json({message: err.message});
            }
        });
}
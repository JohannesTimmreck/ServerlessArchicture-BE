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

export function initDocumentRoutes(app: Express, db: firestore.Firestore, storage: Storage) {
    const baseUrl = "/document";

    app.get(baseUrl,
        (req: any, res: any, next: any) =>
            isConnectedMiddleware(req, res, next, db, false),
        async (request: any, response: any) => {
            db.collection("Documents")
                .get()
                .then((value: any) => {
                    const responseValue: any[] = [];

                    value.forEach((doc: any) => {
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

    app.get(baseUrl + "/:documentId",
        (req: any, res: any, next: any) =>
            isConnectedMiddleware(req, res, next, db, false),
        async (req: any, res: any) => {
            try {
                logger.debug("Start");

                if (!req.params.documentId) {
                    res.status(400).json({message: "Need a document id."});
                    return;
                }

                logger.debug(req.params.documentId);
                const result = await db.collection("Documents").doc(req.params.documentId).get();

                if (!result.exists) {
                    res.status(400).json({message: "The document don't exist"});
                    return;
                }

                logger.debug("exist");

                const data = result.data();

                if (!data) {
                    res.status(400).json({message: "The document don't have data"});
                    return;
                }

                logger.debug("Have data");

                const file = storage.bucket().file(data.filepath);

                const exist = await file.exists();

                if (!exist[0]) {
                    res.status(400).json({message: "This file don't exist."});
                    return;
                }

                logger.debug("Exist in bucket");
                logger.debug(file.name);
            } catch (err: any) {
                logger.error(err);
                res.status(400).json(err);
                return;
            }

            // const filepath = path.join(os.tmpdir(), file.name);

            /* try {
                const result = file
                    .download({ destination: filepath });
                logger.debug(result);
                res.download(filepath, function (error: any) {
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
            } */
        }
    );

    app.delete(baseUrl + "/:documentId",
        (req: any, res: any, next: any) =>
            isConnectedMiddleware(req, res, next, db, false),
        async (req: any, res: any) => {
            if (!req.params.documentId) {
                res.status(400).json({message: "Need a document id."});
                return;
            }

            const result = await db.collection("Documents").doc(req.params.documentId).get();

            if (!result.exists) {
                res.status(400).json({message: "The document don't exist"});
                return;
            }

            const data = result.data();

            if (!data) {
                res.status(400).json({message: "The document don't have data"});
                return;
            }

            if (req.user.uid !== data.user) {
                res.status(400).json({message: "Only the owner of the documents can delete it"});
                return;
            }

            await db.collection("Documents").doc(req.params.documentId).delete();

            const file = storage.bucket().file(data.filepath);

            const exist = await file.exists();

            if (exist[0]) {
                await file.delete();
            }

            res.status(200).json({message: "Delete document."});
        }
    );
}

async function sendFile(req: any, res: any, upload: any, storage: Storage, db: firestore.Firestore) {
    await storage.bucket().upload(upload.filepath, {
        resumable: false,
        gzip: true,
        destination: "Documents/" + req.user.uid + "/" + upload.filename,
    });
    fs.unlinkSync(upload.filepath);
    const result = await db.collection("Documents").add({
        filepath: "Documents/" + req.user.uid + "/" + upload.filename,
        createdAt: FieldValue.serverTimestamp(),
        user: req.user.uid,
        visibility: "public",
    });

    const resu = await result.get();

    const data = resu.data();

    await db.collection("CommentSection").doc(resu.id).set({
    });

    if (data) {
        data.id = resu.id;
    }

    res.status(201).json(data);
}
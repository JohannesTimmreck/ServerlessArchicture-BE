import {isConnectedMiddleware} from "./helpers";
import {FieldValue} from "firebase-admin/firestore";
import {firestore} from "firebase-admin";
import {Express} from "express";
import {logger} from "firebase-functions";

export function initCommentsRoutes(app: Express, db: firestore.Firestore) {
    const baseUrl = "/:document/comments";

    app.post(baseUrl,
        (req: any, res: any, next: any) =>
            isConnectedMiddleware(req, res, next, db, false),
        async (request: any, response: any) => {
            if (!(request.body && request.body.comment)) {
                response.status(400).json({message: "Need a comment."});
                return;
            }
            if (!(request.params && request.params.document)) {
                response.status(400).json({message: "Need the document name."});
                return;
            }
            // test if doc exists
            if (!(await db.collection("Documents").doc(request.params.document).get()).exists
                || !(await db.collection("CommentSection").doc(request.params.document).get()).exists) {
                response.status(400).json({message: "Document or CommentSection doesn't exist."});
                return;
            }
            // TODO Create CommentSection on Document Upload
            // add comment
            db.collection("CommentSection").doc(request.params.document).collection("Comments").add({
                message: request.body.comment,
                user: request.user.uid,
                email: request.user.email,
                createdAt: FieldValue.serverTimestamp(),
            }).then((_value) => {
                response.status(201).json({message: "Comment added."});})
            .catch((err: any) => {
                logger.error(err);
                if (err.details) {
                    response.status(400).json({message: err.details});
                } else {
                    response.status(400).json({message: err.message});
                }
            });
        })

    app.get(baseUrl, 
        (req: any, res: any, next: any) =>
            isConnectedMiddleware(req, res, next, db, false),
        async (request: any, response: any) => {
            // test if doc exists
            if (!(await db.collection("Documents").doc(request.params.document).get()).exists
                || !(await db.collection("CommentSection").doc(request.params.document).get()).exists) {
                response.status(400).json({message: "Document or CommentSection doesn't exist."});
                return;
            }
            db.collection("CommentSection").doc(request.params.document)
                .get()
                .then((value) => {
                    const responseValue: any[] = value.get("Comments");
                    response.status(200).json(responseValue);
                });

        })
}
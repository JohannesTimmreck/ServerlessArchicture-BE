import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as express from "express";
import * as bodyParser from "body-parser";
import {initChatsRoutes} from "./chats";

admin.initializeApp(functions.config().firebase);
const db = admin.firestore();

const app = express();
const main = express();

main.use("/v1", app);
main.use(bodyParser.json());

export const webApi = functions.https.onRequest(main);

initChatsRoutes(app, db);

app.use((req: any, res: any) => {
    res.status(404).json({message: "This route doesn't exist."});
    res.statusMessage = "This route doesn't exist.";
});
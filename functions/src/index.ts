import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as express from "express";
import * as bodyParser from "body-parser";
import {initChatsRoutes} from "./chats";
import {initMessagesRoutes} from "./messages";
import {setUpSocket} from "./socket";
import * as http from "http";

admin.initializeApp(functions.config().firebase);
const db = admin.firestore();

const app = express();
const main = express();

main.use("/v1", app);
main.use(bodyParser.json());

export const webApiEu = functions.region("europe-west1").https.onRequest(main);

const server = new http.Server(app);

const io = setUpSocket(server);

initChatsRoutes(app, db, io);
initMessagesRoutes(app, db, io);

app.use((req: any, res: any) => {
    res.status(404).json({message: "This route doesn't exist."});
    res.statusMessage = "This route doesn't exist.";
});
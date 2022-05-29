import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as express from "express";
import * as bodyParser from "body-parser";
import {initChatsRoutes} from "./chats";
import {initMessagesRoutes} from "./messages";
import * as cors from "cors";

admin.initializeApp(functions.config().firebase);
const db = admin.firestore();
const storage = admin.storage();

const app = express();
const main = express();

main.use("/v1", app);
main.use(bodyParser.json());

app.use(cors({
    origin: "*",
}));

export const webApiEu = functions.region("europe-west1").https.onRequest(main);

initChatsRoutes(app, db, storage);
initMessagesRoutes(app, db, storage);

app.use((req: any, res: any) => {
    res.status(404).json({message: "This route doesn't exist."});
    res.statusMessage = "This route doesn't exist.";
});

export const createUser = functions.region("europe-west1").auth.user().onCreate((user) => {
    db.collection("Users").doc(user.uid).set({
        Documents: [],
        Groups: [],
        Roles: ["User"],
        Rights: [],
    });
});
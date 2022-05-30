import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as express from "express";
import * as bodyParser from "body-parser";
import {initChatsRoutes} from "./chats";
import {initMessagesRoutes} from "./messages";
import * as cors from "cors";
import {initDeviceRoutes} from "./device";
import {initGroupsRoutes} from "./groups";
import {FieldValue} from "firebase-admin/firestore";

admin.initializeApp(functions.config().firebase);
const db = admin.firestore();
const storage = admin.storage();
const cloudMessaging = admin.messaging();

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
initGroupsRoutes(app, db);

initDeviceRoutes(app, db);

app.use((req: any, res: any) => {
    res.status(404).json({message: "This route doesn't exist."});
    res.statusMessage = "This route doesn't exist.";
});

export const onNewMessage = functions.region("europe-west1").firestore.document("Chats/{chatName}/Messages/{messageId}")
    .onCreate(async (snap, context) => {
        const document = snap.data();

        const docRef = db.collection("Chats").doc(context.params.chatName);

        const docDataGet = await docRef.get();

        const docData = docDataGet.data();

        const tokenToSend: string[] = [];

        const toWait: any[] = [];

        if (docData) {
            docData.user.forEach(async (uid: string) => {
                if (document.systemMessage || uid !== document.user) {
                    toWait.push(db.collection("Users").doc(uid).get().then((result) => {
                        const data = result.data();

                        if (data) {
                            data.Devices.forEach((element: string) => {
                                tokenToSend.push(element);
                            });
                        }
                    }));
                }
            });

            await Promise.all(toWait);

            const data = document;

            data.chatName = context.params.chatName;
            data.messageId = context.params.messageId;

            const message = {
                data: data,
                tokens: tokenToSend,
            };

            cloudMessaging.sendMulticast(message).then((response) => {
                response.responses.forEach((result, index) => {
                    const error = result.error;
                    if (!result.success && error) {
                        console.error("Failure sending notification to", tokenToSend[index], error);
                    }
                });
            });
        }
    });

export const createUser = functions.region("europe-west1").auth.user().onCreate((user) => {
    db.collection("Users").doc(user.uid).set({
        Documents: [],
        Groups: [],
        Roles: ["User"],
        Rights: [],
        Devices: [],
    });

    db.collection("Chats").doc("files").update({
        user: FieldValue.arrayUnion(user.uid),
    });
});
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as express from "express";
import * as bodyParser from "body-parser";
import {isConnectedMiddleware} from "./helpers";

admin.initializeApp(functions.config().firebase);
const db = admin.firestore();

const app = express();
const main = express();

main.use("/api/v1", app);
main.use(bodyParser.json());

export const webApi = functions.https.onRequest(main);

app.put("/warmup",
    (req: any, res: any, next: any) =>
        isConnectedMiddleware(req, res, next, db),
    (request, response) => {
        response.send("Warming up friend.");
    }
);

export * from "./create_user";
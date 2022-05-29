import {isConnectedMiddleware} from "./helpers";
import {FieldValue} from "firebase-admin/firestore";
import {firestore} from "firebase-admin";
import {Express} from "express";
import {logger} from "firebase-functions";

export function initUserRoutes(app: Express, db: firestore.Firestore) {
    const baseUrl = "/user";

    // get own user
    app.get(baseUrl, )

    // get specific user
}

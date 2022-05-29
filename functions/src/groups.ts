import {isConnectedMiddleware} from "./helpers";
import {FieldValue} from "firebase-admin/firestore";
import {firestore} from "firebase-admin";
import {Express} from "express";
import {logger} from "firebase-functions";

export function initGroupsRoutes(app: Express, db: firestore.Firestore) {
    const baseUrl = "/groups";

    // get own groups
    app.get(baseUrl, )

    // create new group
    app.post(baseUrl, )

    // get specific group
    app.get(baseUrl + "/:groupName", )

    // delete group
    app.delete(baseUrl + "/:groupName", )
}
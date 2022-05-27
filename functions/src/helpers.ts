import { firestore } from "firebase-admin";

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

export async function verifyToken(
    request: functions.Request
): Promise<boolean> {
    try {
        const token: string | undefined = await getToken(request);

        if (!token) {
            return false;
        }

        const payload: admin.auth.DecodedIdToken =
            await admin.auth().verifyIdToken(token);
        if (payload !== null) {
            (<any>request).user = payload
            return true
        }
        return false;
    } catch (err) {
        return false;
    }
}

async function getToken(request: functions.Request):
    Promise<string | undefined> {
    if (!request.headers.authorization) {
        return undefined;
    }

    const token: string =
        request.headers.authorization.replace(/^Bearer\s/, '');

    return token;
}

export async function isConnectedMiddleware(
    req: any,
    res: any,
    next: any,
    db: firestore.Firestore
) {
    if (await verifyToken(req) && await haveRight(req.user.uuid, db)) {
        next();
    } else {
        res.status(401).send("Need to be auth.");
    }
}

export async function haveRight(
    uuid: any,
    db: firestore.Firestore
): Promise<boolean> {
    if (uuid) {
        const user = await db.collection("Users").doc(uuid).get();
        return (
            user &&
            user.exists &&
            ("User" in user.get("Groups") || "User" in user.get("Roles"))
        );
    } else {
        return false;
    }
}
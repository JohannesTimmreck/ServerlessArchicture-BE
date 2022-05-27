import {firestore} from "firebase-admin";

export async function isConnectedMiddleware(
    req: any,
    res: any,
    next: any,
    db: firestore.Firestore
) {
    if (await isConnected(req, db)) {
        next();
    } else {
        res.status(401).send("Something broke!");
    }
}

export async function isConnected(
    request: any,
    db: firestore.Firestore
): Promise<boolean> {
    if (request.auth && request.auth.uid) {
        const user = await db.collection("Users").doc(request.auth.uid).get();
        return (
            user &&
            user.exists &&
            ("User" in user.get("Groups") || "User" in user.get("Roles"))
        );
    } else {
        return false;
    }
}
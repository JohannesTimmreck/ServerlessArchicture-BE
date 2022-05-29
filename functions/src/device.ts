import {isConnectedMiddleware} from "./helpers";
import {firestore} from "firebase-admin";
import {Express} from "express";
import {FieldValue} from "firebase-admin/firestore";

export function initDeviceRoutes(app: Express, db: firestore.Firestore) {
    const baseUrl = "/device";

    app.post(baseUrl,
        (req: any, res: any, next: any) =>
            isConnectedMiddleware(req, res, next, db, false),
        async (req: any, res: any) => {
            if (!(req.body && req.body.token)) {
                res.status(400).json({message: "Need a token device generate by firebase cloud messaging."});
                return;
            }

            const docDataGet = await db.collection("Users").doc(req.user.uid).get();

            if (!(docDataGet.exists)) {
                res.status(400).json({message: "This user don't exist in firebase Database."});
                return;
            }

            const docData = docDataGet.data();

            if (docData && docData.Devices.find((element: string) => element === req.body.token)) {
                res.status(400).json({message: "Already present in this device."});
                return;
            }

            db.collection("Users").doc(req.user.uid).update({
                Devices: FieldValue.arrayUnion(req.body.token),
            });

            res.status(200).json({message: "Add device."});
        }
    );
}
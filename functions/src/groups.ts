import {isConnectedMiddleware} from "./helpers";
import {FieldValue} from "firebase-admin/firestore";
import {firestore} from "firebase-admin";
import {Express} from "express";
import {logger} from "firebase-functions";

export function initGroupsRoutes(app: Express, db: firestore.Firestore) {
    const baseUrl = "/groups";

    // create new group
    app.post(baseUrl,
        (req: any, res: any, next: any) =>
            isConnectedMiddleware(req, res, next, db, false),
        async (request: any, response: any) => {
            logger.info("Start Creating Group");
            logger.info(request);
            const userRef = db.collection("Users").doc(request.user.uid);
            const userDataGet = await userRef.get();

            if (!(userDataGet.exists)) {
                response.status(400).json({message: "This user doesn't exist."});
                return;
            }

            if (!(request.body && request.body.name)) {
                response.status(400).json({message: "Need a name."});
                return;
            }
            if ((await db.collection("Groups").doc(request.body.name).get()).exists) {
                response.status(400).json({message: "This group already exist."});
                return;
            }
            logger.info("Creating Roles");
            db.collection("Roles").doc(request.body.name + "_User").set({
                Rights: ["read_groups"],
            }).catch((err: any) => {
                logger.error(err);
                response.status(400).json({message: err.details});
                return;
            });
            db.collection("Roles").doc(request.body.name + "Admin").set({
                Rights: ["read_groups", "update_groups", "delete_groups"],
            }).catch((err: any) => {
                logger.error(err);
                response.status(400).json({message: err.details});
                return;
            });
            db.collection("Roles").doc(request.body.name + "_Manager").set({
                Rights: ["read_groups", "update_groups", "delete_groups"],
            }).catch((err: any) => {
                logger.error(err);
                response.status(400).json({message: err.details});
                return;
            });
            logger.info("Creating Group");
            db.collection("Groups").doc(request.body.name).set({
                Roles: [request.body.name + "_User", request.body.name + "Admin", request.body.name + "_Manager"],
                lastUpdate: FieldValue.serverTimestamp(),
            }).catch((err: any) => {
                logger.error(err);
                response.status(400).json({message: err.details});
                return;
            });
            logger.info("Updating User");
            userRef.update({
                Groups: FieldValue.arrayUnion(request.body.name),
                Roles: FieldValue.arrayUnion(request.body.name + "_Manager"),
            }).then(() => {
                response.status(201).json({message: "Group created."});
            }).catch((err: any) => {
                logger.error(err);
                response.status(400).json({message: err.details});
                return;
            });
        });

    // get own groups
    app.get(baseUrl + "/mine",
        (req: any, res: any, next: any) =>
            isConnectedMiddleware(req, res, next, db, false),
        async (request: any, response: any) => {
            db.collection("Users").doc(request.user.uid)
                .get()
                .then((value) => {
                    const responseValue: any[] = value.get("Groups");
                    response.status(200).json(responseValue);
                });
        });

    // // get specific group
    // app.get(baseUrl + "/:groupName",  (req: any, res: any, next: any) =>
    //         isConnectedMiddleware(req, res, next, db, false),
    //     async (request: any, response: any) => {

    // });

    app.put(baseUrl + "/add/:groupName",
        (req: any, res: any, next: any) =>
            isConnectedMiddleware(req, res, next, db, false),
        async (request: any, response: any) => {
            logger.info("Start Adding to Group Process");
            if (!(request.params && request.params.groupName)) {
                response.status(400).json({message: "Need the groupname."});
                return;
            }
            if (!(request.body && request.body.email)) {
                response.status(400).json({message: "Need the users email."});
                return;
            }
            // user validation
            const userRef = db.collection("Users").doc(request.user.uid);
            const userDataGet = await userRef.get();

            if (!(userDataGet.exists)) {
                response.status(400).json({message: "This user doesn't exist."});
                return;
            }
            const userData = userDataGet.data();
            // target user validation
            let targetUser: any = null;

            logger.info(request.body);
            db.collection("Users")
                .where("Email", "==", request.body.email)
                .get()
                .then((value: firestore.QuerySnapshot<firestore.DocumentData>) => {
                    logger.info(value.docs);
                    if (value.size != 1) {
                        response.status(400).json({message: "This target user doesn't exist."});
                        return;
                    }
                    targetUser = value.docs[0].id;
                });

            if (targetUser === null) {
                return;
            }
            const targetUserRef = db.collection("Users").doc(targetUser);
            const targetUserDataGet = await targetUserRef.get();

            if (!(targetUserDataGet.exists)) {
                response.status(400).json({message: "This user doesn't exist."});
                return;
            }
            // group validation
            const groupRef = db.collection("Groups").doc(request.params.groupName);

            const groupDataGet = await groupRef.get();

            if (!(groupDataGet.exists)) {
                response.status(400).json({message: "This group doesn't exist."});
                return;
            }

            if (!userData || !userData.Groups.find((element: string) => element === request.params.groupName) ||
                !userData.Roles.find((element: string) => (element === request.params.groupName + "_Admin" ||
                    element === request.params.groupName + "_Manager"))) {
                response.status(400).json({message: "Not allowed to add user to this group."});
                return;
            }
            logger.info("Finished Validations. Adding to group");
            targetUserRef.update({
                Groups: FieldValue.arrayUnion(request.params.groupName),
                Roles: FieldValue.arrayUnion(request.params.groupName + "_User"),
            }).then(() => {
                response.status(200).json({message: "Added to group."});
            }).catch((err: any) => {
                logger.error(err);
                response.status(400).json({message: err.details});
                return;
            });
        });

    app.put(baseUrl + "/add/:groupName/admin",
        (req: any, res: any, next: any) =>
            isConnectedMiddleware(req, res, next, db, false),
        async (request: any, response: any) => {
            logger.info("Start Adding to Group Admin Process");
            if (!(request.params && request.params.groupName)) {
                response.status(400).json({message: "Need the groupname."});
                return;
            }
            if (!(request.body && request.body.email)) {
                response.status(400).json({message: "Need the users email."});
                return;
            }
            // user validation
            const userRef = db.collection("Users").doc(request.user.uid);
            const userDataGet = await userRef.get();

            if (!(userDataGet.exists)) {
                response.status(400).json({message: "This user doesn't exist."});
                return;
            }
            const userData = userDataGet.data();
            // target user validation
            let targetUser: any = null;
            db.collection("Users")
                .where("Email", "==", request.body.email)
                .get()
                .then((value: firestore.QuerySnapshot<firestore.DocumentData>) => {
                    logger.info(value.docs);
                    if (value.size != 1) {
                        response.status(400).json({message: "This target user doesn't exist."});
                        return;
                    }
                    targetUser = value.docs[0].id;
                });

            if (targetUser === null) {
                return;
            }
            const targetUserRef = db.collection("Users").doc(targetUser);
            const targetUserDataGet = await targetUserRef.get();

            if (!(targetUserDataGet.exists)) {
                response.status(400).json({message: "This user doesn't exist."});
                return;
            }
            // group validation
            const groupRef = db.collection("Groups").doc(request.params.groupName);

            const groupDataGet = await groupRef.get();

            if (!(groupDataGet.exists)) {
                response.status(400).json({message: "This group doesn't exist."});
                return;
            }

            if (!userData || !userData.Groups.find((element: string) => element === request.params.groupName) ||
                !userData.Roles.find((element: string) => (element === request.params.groupName + "_Admin" ||
                    element === request.params.groupName + "_Manager"))) {
                response.status(400).json({message: "Not allowed to add user to this group."});
                return;
            }
            logger.info("Finished Validations. Adding to group admin");
            targetUserRef.update({
                Groups: FieldValue.arrayUnion(request.params.groupName),
                Roles: FieldValue.arrayUnion(request.params.groupName + "_Admin"),
            }).then(() => {
                response.status(200).json({message: "Added as Admin."});
            }).catch((err: any) => {
                logger.error(err);
                response.status(400).json({message: err.details});
                return;
            });
        });

    app.put(baseUrl + "/add/:groupName/manager",
        (req: any, res: any, next: any) =>
            isConnectedMiddleware(req, res, next, db, false),
        async (request: any, response: any) => {
            logger.info("Start adding to group managers.");
            if (!(request.params && request.params.groupName)) {
                response.status(400).json({message: "Need the groupname."});
                return;
            }
            if (!(request.body && request.body.email)) {
                response.status(400).json({message: "Need the users email."});
                return;
            }
            // user validation
            const userRef = db.collection("Users").doc(request.user.uid);
            const userDataGet = await userRef.get();

            if (!(userDataGet.exists)) {
                response.status(400).json({message: "This user doesn't exist."});
                return;
            }
            const userData = userDataGet.data();
            // target user validation
            let targetUser: any = null;
            db.collection("Users")
                .where("Email", "==", request.body.email)
                .get()
                .then((value: firestore.QuerySnapshot<firestore.DocumentData>) => {
                    logger.info(value.docs);
                    if (value.size != 1) {
                        response.status(400).json({message: "This target user doesn't exist."});
                        return;
                    }
                    targetUser = value.docs[0].id;
                });

            if (targetUser === null) {
                return;
            }
            const targetUserRef = db.collection("Users").doc(targetUser);
            const targetUserDataGet = await targetUserRef.get();

            if (!(targetUserDataGet.exists)) {
                response.status(400).json({message: "This user doesn't exist."});
                return;
            }
            // group validation
            const groupRef = db.collection("Groups").doc(request.params.groupName);

            const groupDataGet = await groupRef.get();

            if (!(groupDataGet.exists)) {
                response.status(400).json({message: "This group doesn't exist."});
                return;
            }

            if (!userData || !userData.Groups.find((element: string) => element === request.params.groupName) ||
                !userData.Roles.find((element: string) => (element === request.params.groupName + "_Admin" ||
                    element === request.params.groupName + "_Manager"))) {
                response.status(400).json({message: "Not allowed to add user to this group."});
                return;
            }
            logger.info("Finished Validations. Adding to group managers");
            targetUserRef.update({
                Groups: FieldValue.arrayUnion(request.params.groupName),
                Roles: FieldValue.arrayUnion(request.params.groupName + "_Manager"),
            }).then(() => {
                response.status(200).json({message: "Added to group as Manager."});
            }).catch((err: any) => {
                logger.error(err);
                response.status(400).json({message: err.details});
                return;
            });
        });

    /* app.put(baseUrl + "/leave/:groupName",
        (req: any, res: any, next: any) =>
            isConnectedMiddleware(req, res, next, db, false),
        (request: any, response: any) => {

        }); */

    // // delete group
    // app.delete(baseUrl + "/:groupName", );
}
import * as functions from "firebase-functions";

export const testFunc = functions.https.onRequest((request, response) => {
    functions.logger.info("Create User functiontFunc");
    response.send("Creating User!");
});
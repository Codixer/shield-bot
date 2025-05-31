import { Interaction, Client } from "discord.js";
import { Next } from "koa";
import { respondWithError } from "./generalUtils.js";
import { isLoggedInAndVerified } from "./vrchat.js";

export async function VRChatLoginGuard(interaction: Interaction, _client: Client, next: Next): Promise<unknown> {
    if (await isLoggedInAndVerified()) {
        return next();
    }

    return respondWithError(interaction, "Please inform staff of the following error: `VRChat is not logged in or otp verified`");
}
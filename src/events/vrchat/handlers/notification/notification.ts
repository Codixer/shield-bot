import { handleFriendRequestNotification } from "./types/friendrequest.js";
import { handleInviteNotification } from "./types/invite.js";
import { handleResponseNotification } from "./types/response.js";

export function handleNotification(content: any) {
    switch (content.type) {
        case "friendRequest":
            handleFriendRequestNotification(content);
            break;
        case "invite":
            handleInviteNotification(content);
            break;
        case "inviteResponse":
        case "message":
        case "requestInvite":
        case "requestInviteResponse":
        case "votetokick":
            handleResponseNotification(content); // Placeholder, update to specific handler if needed
            break;
        default:
            console.log("[VRChat Notification][Unknown]", content);
    }
}

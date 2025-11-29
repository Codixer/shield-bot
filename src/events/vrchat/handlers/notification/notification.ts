import { handleFriendRequestNotification } from "./types/friendrequest.js";
import { handleInviteNotification } from "./types/invite.js";
import { handleResponseNotification } from "./types/response.js";

export async function handleNotification(content: any) {
  switch (content.type) {
    case "friendRequest":
      await handleFriendRequestNotification(content).catch((err) => {
        console.error("[Notification] Error handling friendRequest:", err);
      });
      break;
    case "invite":
      await handleInviteNotification(content).catch((err) => {
        console.error("[Notification] Error handling invite:", err);
      });
      break;
    // case "inviteResponse":
    // case "message":
    // case "requestInvite":
    // case "requestInviteResponse":
    // case "votetokick":
    //     handleResponseNotification(content); // Placeholder, update to specific handler if needed
    //     break;
    default:
      console.debug("[VRChat Notification][Unknown]", content);
  }
}

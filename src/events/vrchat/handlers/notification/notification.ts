import { handleFriendRequestNotification } from "./types/friendrequest.js";
import { handleInviteNotification } from "./types/invite.js";
import { loggers } from "../../../../utility/logger.js";

export async function handleNotification(content: any) {
  switch (content.type) {
    case "friendRequest":
      await handleFriendRequestNotification(content).catch((err) => {
        loggers.vrchat.error("Error handling friendRequest", err);
      });
      break;
    case "invite":
      await handleInviteNotification(content).catch((err) => {
        loggers.vrchat.error("Error handling invite", err);
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
      loggers.vrchat.debug("Unknown notification type", { content });
  }
}

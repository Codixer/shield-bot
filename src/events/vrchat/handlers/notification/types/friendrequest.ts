import { vrchatApi } from "../../../../../utility/vrchatClient.js";

export async function handleFriendRequestNotification(content: any) {
  console.log("[VRChat Notification][FriendRequest]", content);
  // Accept the friend request notification automatically
  if (content.id) {
    try {
      const result = await vrchatApi.notificationApi.acceptFriendRequest({ notificationId: content.id });
      console.log("[VRChat Notification][FriendRequest][Accepted]", result);
    } catch (error) {
      console.error(
        "[VRChat Notification][FriendRequest][Accept Error]",
        error,
      );
    }
  } else {
    console.warn(
      "[VRChat Notification][FriendRequest] Missing notification id or authToken",
      content,
    );
  }
}

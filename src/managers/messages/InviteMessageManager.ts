import { updateInviteMessage, listInviteMessages, getCurrentUser } from "../../utility/vrchat.js";

export enum InviteMessageType {
    Message = "message",
    Response = "response",
    Request = "request",
    RequestResponse = "requestResponse"
}

export interface InviteMessage {
    canBeUpdated: boolean;
    id: string;
    message: string;
    messageType: InviteMessageType;
    remainingCooldownMinutes: number;
    slot: number;
    updatedAt: string;
}

export class InviteMessageManager {
    static readonly DEFAULT_MESSAGES: Record<InviteMessageType, string[]> = {
        [InviteMessageType.Message]: [
            "Come hang out with me!",
            "Come hang out with everyone!",
            "I want you to meet someone!",
            "Let's go play a game!",
            "Let's go exploring!",
            "Let's go find some new friends!",
            "Let's party!",
            "Let's chill out.",
            "Let's watch some videos!",
            "Come look at this world I found!",
            "Let's go find some avatars!",
            "Can you come help me with something?"
        ],
        [InviteMessageType.Response]: [
            "I'm busy right now! Please ask me again later.",
            "I'll join you in a few minutes!",
            "I'm about to go AFK, I'll join on you later.",
            "I'm about to log off, I'll see you later!",
            "I'm busy at an event!",
            "Join my instance instead! I'll send you an invite.",
            "I can't invite you to my instance, I'll ask the instance owner.",
            "Sorry, can't join right now! Send me a message on Discord!",
            "Sorry, the instance I'm in is private!",
            "Sorry, the instance I'm in is full!",
            "I'll be right back, I'll send you an invite when I return!",
            "Sorry, I'm working on something right now!"
        ],
        [InviteMessageType.Request]: [
            "Hey, can you invite me?",
            "Please invite me!",
            "Haven't seen you in a while. Can I join?",
            "I'd like to drop by real quick!",
            "I'd like to chat!",
            "I want to show you something!",
            "Can I come check out that world?",
            "Invite me to the party!",
            "I want to come visit!",
            "I'd like to see you!",
            "Can I come explore with you?",
            "I want to hang out with you!"
        ],
        [InviteMessageType.RequestResponse]: [
            "I'm busy right now! Please ask me again later.",
            "I'll join off you instead in a bit!",
            "I'm about to go AFK, I'll join on you later.",
            "I'm about to log off, I'll see you later!",
            "I'm busy at an event!",
            "I'm gonna join your instance instead! Send me an inv!",
            "I can't invite you to my instance, I'll ask the instance owner.",
            "Sorry, can't inv right now! Send me a message on Discord!",
            "I'm about to leave this instance, send me another in a sec.",
            "Sorry, the instance I'm in is full!",
            "I'll be right back, I'll send you an invite when I return!",
            "Sorry, I'm working on something right now!"
        ]
    };

    /**
     * Updates invite messages for a user to match the provided enum list.
     * @param userId The VRChat user ID
     * @param messageType The type of message
     * @param messages The array of messages to set (index = slot)
     * @returns The updated list of InviteMessage objects
     */
    static async syncInviteMessages({
        userId,
        messageType,
        messages
    }: {
        userId: string;
        messageType: InviteMessageType;
        messages: string[];
    }): Promise<InviteMessage[]> {
        // Get current messages
        const current = await listInviteMessages({ userId, messageType });
        // Update only if different
        for (let slot = 0; slot < messages.length; slot++) {
            const newMsg = messages[slot];
            const currentMsg = current.find((m: any) => m.slot === slot);
            if (!currentMsg || currentMsg.message !== newMsg) {
                try {
                    await updateInviteMessage({ userId, messageType, slot, message: newMsg });
                } catch (e: any) {
                    if (e.message && e.message.includes("429")) {
                        // Cooldown, skip
                        continue;
                    } else {
                        throw e;
                    }
                }
            }
        }
        // Return the latest list
        return await listInviteMessages({ userId, messageType });
    }

    /**
     * Gets the current invite messages for a user and type.
     */
    static async getInviteMessages(userId: string, messageType: InviteMessageType): Promise<InviteMessage[]> {
        return await listInviteMessages({ userId, messageType });
    }
}

// For convenient access: InviteMessageManager.messages.requestResponse.busy
export const invite = {
    message: {
        comeHangOut: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.Message][0],
        comeHangOutWithEveryone: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.Message][1],
        meetSomeone: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.Message][2],
        playGame: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.Message][3],
        exploring: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.Message][4],
        findFriends: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.Message][5],
        party: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.Message][6],
        chill: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.Message][7],
        watchVideos: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.Message][8],
        lookAtWorld: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.Message][9],
        findAvatars: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.Message][10],
        helpMe: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.Message][11],
    },
    response: {
        busy: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.Response][0],
        joinInMinutes: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.Response][1],
        afk: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.Response][2],
        logOff: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.Response][3],
        event: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.Response][4],
        joinMyInstance: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.Response][5],
        askOwner: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.Response][6],
        discordMsg: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.Response][7],
        privateInstance: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.Response][8],
        fullInstance: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.Response][9],
        beRightBack: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.Response][10],
        working: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.Response][11],
    },
    request: {
        inviteMe: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.Request][0],
        pleaseInvite: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.Request][1],
        longTime: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.Request][2],
        dropBy: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.Request][3],
        chat: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.Request][4],
        showYou: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.Request][5],
        checkWorld: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.Request][6],
        party: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.Request][7],
        visit: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.Request][8],
        seeYou: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.Request][9],
        explore: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.Request][10],
        hangOut: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.Request][11],
    },
    requestresponse: {
        busy: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.RequestResponse][0],
        joinOffYou: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.RequestResponse][1],
        afk: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.RequestResponse][2],
        logOff: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.RequestResponse][3],
        event: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.RequestResponse][4],
        joinYourInstance: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.RequestResponse][5],
        askOwner: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.RequestResponse][6],
        discordMsg: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.RequestResponse][7],
        leaving: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.RequestResponse][8],
        fullInstance: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.RequestResponse][9],
        beRightBack: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.RequestResponse][10],
        working: InviteMessageManager.DEFAULT_MESSAGES[InviteMessageType.RequestResponse][11],
    }
};

// Utility to sync a single message by type, slot, and key
export async function syncInviteMessageIfDifferent({
    userId,
    type,
    slot,
    expected
}: {
    userId: string;
    type: InviteMessageType;
    slot: number;
    expected: string;
}) {
    const current = await listInviteMessages({ userId, messageType: type });
    const msg = current.find((m: any) => m.slot === slot);
    if (msg.message !== expected) {
        console.log(`[InviteMessageManager] Message mismatch for userId=${userId}, type=${type}, slot=${slot}.`);
        console.log(`[InviteMessageManager] Current: "${msg.message}" | Expected: "${expected}"`);
        await updateInviteMessage({ userId, messageType: type, slot, message: expected });
        console.log(`[InviteMessageManager] Updated message for userId=${userId}, type=${type}, slot=${slot} to: "${expected}"`);
    } 
}

/**
 * Syncs all invite messages for all types and slots to their default values for the currently logged-in user.
 * Usage: await syncAllInviteMessages();
 */
export async function syncAllInviteMessages(userId?: string) {
    let actualUserId = userId;
    if (!actualUserId) {
        const user = await getCurrentUser();
        if (!user || !user.id) throw new Error("No logged-in VRChat user found.");
        actualUserId = user.id;
    }
    // TypeScript: actualUserId is now guaranteed to be a string
    for (const type of Object.values(InviteMessageType)) {
        const defaults = InviteMessageManager.DEFAULT_MESSAGES[type as InviteMessageType];
        for (let slot = 0; slot < defaults.length; slot++) {
            const expected = defaults[slot];
            await syncInviteMessageIfDifferent({ userId: actualUserId as string, type: type as InviteMessageType, slot, expected });
        }
    }
    console.log(`[InviteMessageManager] All invite messages synced for userId=${actualUserId}`);
}

// Example usage:
// await syncInviteMessageIfDifferent({
//   userId: "usr_xxx",
//   type: InviteMessageType.RequestResponse,
//   slot: 0,
//   expected: invite.requestresponse.busy
// });

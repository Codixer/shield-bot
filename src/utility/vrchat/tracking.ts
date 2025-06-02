// Consent and tracking UI methods

import { prisma } from "../../main.js";
import { ContainerBuilder, SectionBuilder, ButtonBuilder, ButtonStyle, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize } from "discord.js";

export async function hasFriendLocationConsent(ownerVrcUserId: string): Promise<boolean> {
    const consent = await prisma.friendLocationConsent.findFirst({
        where: { ownerVrcUserId },
    });
    return !!consent;
}

export function buildLocationTrackingContainer(
    verifiedAccounts: { vrcUserId: string }[],
    consents: Record<string, boolean>,
    usernames: Record<string, string>,
    friendsMap: Record<string, boolean>
) {
    const container = new ContainerBuilder();
    container.addSectionComponents(
        new SectionBuilder()
            .setButtonAccessory(
                new ButtonBuilder()
                    .setLabel("Info")
                    .setStyle(ButtonStyle.Secondary)
                    .setCustomId("locationtracking:info")
                    .setEmoji("ℹ️")
                    .setDisabled(true)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `**Location Tracking System**\n\n` +
                    `This system helps you keep track of your verified VRChat accounts, but only under certain conditions:\n` +
                    `• Only accounts that are fully verified with the bot will appear in the list below.\n` +
                    `• The bot uses VRChat's websockets to receive updates about your location when you are friends.\n` +
                    `• For public tracking, you must be in a public, friend+, or friends instance for the bot to keep tracking your location.\n` +
                    `• If you are in an invite+ or invite-only instance, you will need to manually invite the bot so it can determine your world.\n`
                )
            )
    );
    container.addSeparatorComponents(
        new SeparatorBuilder()
            .setSpacing(SeparatorSpacingSize.Small)
            .setDivider(true)
    );
    for (const acc of verifiedAccounts) {
        const isTracking = consents[acc.vrcUserId] || false;
        const isFriends = friendsMap[acc.vrcUserId] !== false;
        const button = new ButtonBuilder()
            .setStyle(isTracking ? ButtonStyle.Success : ButtonStyle.Danger)
            .setLabel(isTracking ? "Tracking" : "Not tracking")
            .setCustomId(isTracking ? `tracking:${acc.vrcUserId}` : `nottracking:${acc.vrcUserId}`)
            .setDisabled(!isFriends);
        const username = usernames[acc.vrcUserId] || acc.vrcUserId;
        const section = new SectionBuilder()
            .setButtonAccessory(button)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(username)
            );
        container.addSectionComponents(section);
    }
    return container;
}

import { CommandInteraction, MessageFlags, EmbedBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, SectionBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ApplicationIntegrationType, InteractionContextType } from "discord.js";
import { Discord, Guard, Slash, SlashGroup } from "discordx";
import { prisma } from "../../main.js";
import { VRChatLoginGuard } from "../../utility/guards.js";
import { BotOwnerGuard } from "../../utility/guards.js";
import { getUserById } from "../../utility/vrchat.js";

@Discord()
@SlashGroup({
  description: "Location tracking commands",
  name: "location",
  root: "vrchat"
})
@SlashGroup("location", "vrchat")
@Guard(VRChatLoginGuard)
@Guard(BotOwnerGuard)
export class VRChatLocationTrackingCommand {

    @Slash({
        name: "locationtracking",
        description: "Toggle location tracking consent for your verified VRChat accounts.",
    })
    async locationTracking(interaction: CommandInteraction) {
        const discordId = interaction.user.id;
        // Get all verified VRChat accounts for this user
        const user = await prisma.user.findUnique({ where: { discordId }, include: { vrchatAccounts: true } });
        if (!user || !user.vrchatAccounts || user.vrchatAccounts.length === 0) {
            await interaction.reply({
                content: "No verified VRChat accounts found for your Discord account.",
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        // List all verified accounts
        const verifiedAccounts = user.vrchatAccounts.filter((acc: any) => acc.accountType === "MAIN" || acc.accountType === "ALT");
        if (verifiedAccounts.length === 0) {
            await interaction.reply({
                content: "No verified VRChat accounts found for your Discord account.",
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Fetch consents, usernames, and isFriends simply, one at a time
        const consents: Record<string, boolean> = {};
        const usernames: Record<string, string> = {};
        const friendsMap: Record<string, boolean> = {};
        for (const acc of verifiedAccounts) {
            consents[acc.vrcUserId] = !!(await prisma.friendLocationConsent.findFirst({
                where: { ownerVrcUserId: acc.vrcUserId }
            }));
            try {
                const userInfo = await getUserById(acc.vrcUserId);
                usernames[acc.vrcUserId] = userInfo?.displayName || acc.vrcUserId;
                friendsMap[acc.vrcUserId] = userInfo?.isFriend ?? true; // default to true if not present
            } catch (e) {
                console.error(`Failed to fetch user info for ${acc.vrcUserId}:`, e);
                usernames[acc.vrcUserId] = acc.vrcUserId;
                friendsMap[acc.vrcUserId] = true;
            }
        }
        // Build the container with the fetched data
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
        await interaction.reply({
            components: [container],
            flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2]
        });
    }
}

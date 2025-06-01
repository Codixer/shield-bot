import { Discord, Slash, SlashOption, SlashChoice } from "discordx";
import { CommandInteraction, ApplicationCommandOptionType, ApplicationIntegrationType, ActionRowBuilder, ButtonBuilder, ButtonStyle, Message, MessageFlags, InteractionContextType } from "discord.js";
import { findFriendInstanceOrWorld, getFriendInstanceInfo, getInstanceInfoByShortName, getUserById, hasFriendLocationConsent } from "../utility/vrchat.js";

@Discord()
export default class BackupRequestCommand {
    @Slash({
        name: "backup-request",
        description: "Request a backup for SHIELD.",
        integrationTypes: [ApplicationIntegrationType.UserInstall],
        contexts: [InteractionContextType.Guild, InteractionContextType.PrivateChannel],
    })
    async backupRequest(
        @SlashChoice({ name: "Standby Deputies", value: "999860674404569242" })
        @SlashChoice({ name: "Standby TRU", value: "999860876062498827" })
        @SlashChoice({ name: "Standby EMT", value: "999860757770543184" })
        @SlashOption({
            name: "role",
            description: "What role to ping/request (Standby Deputies, Standby TRU, Standby EMT)",
            type: ApplicationCommandOptionType.String,
            required: true,
        }) role: string,
        @SlashOption({
            name: "situation",
            description: "Current Situation. Hostage, Active Shooter, Etc",
            type: ApplicationCommandOptionType.String,
            required: true,
        }) situation: string,
        @SlashChoice({ name: "Adam", value: "814239808675119144" })
        @SlashChoice({ name: "Baker", value: "814239954641223760" })
        @SlashChoice({ name: "Coffee", value: "814240045405569038" })
        @SlashChoice({ name: "Delta", value: "814240176317923391" })
        @SlashChoice({ name: "Eagle", value: "814240290494742732" })
        @SlashChoice({ name: "Fitness", value: "814240677004836925" })
        @SlashChoice({ name: "Gamma", value: "814241070110998558" })
        @SlashChoice({ name: "Mag", value: "1012880059415150642" })
        @SlashChoice({ name: "EMT", value: "814932938961190953" })
        @SlashChoice({ name: "TRU", value: "814933108658274365" })
        @SlashOption({
            name: "squad",
            description: "Squad (Adam, Baker, Coffee, etc)",
            type: ApplicationCommandOptionType.String,
            required: true,
        }) squad: string,
        @SlashChoice({ name: "Active (🔴)", value: "active" })
        @SlashChoice({ name: "Resolved (🟢)", value: "resolved" })
        @SlashOption({
            name: "status",
            description: "Status",
            type: ApplicationCommandOptionType.String,
            required: true,
        }) status: string,
        @SlashOption({
            name: "world",
            description: "World Link or Detected over vrc account",
            type: ApplicationCommandOptionType.String,
            required: false,
        }) world: string,
        interaction: CommandInteraction,
    ) {
        // Use role directly as roleId
        const roleId = role;

        // Use squad as the channel ID directly
        let squadChannelMention = "";
        if (squad) {
            squadChannelMention = `<#${squad}>`;
        }

        

        // Build the reply message in the requested format
        const roleMention = `<@&${roleId}>`;
        const requestType =
            roleId === "999860674404569242"
                ? "Standby Deputies"
                : roleId === "999860757770543184"
                ? "EMT"
                : roleId === "999860876062498827"
                ? "TRU"
                : "Backup";
        const situationText = situation ? situation : "[SITUATION NOT PROVIDED]";
        const squadText = squadChannelMention ? squadChannelMention : "[SQUAD NOT PROVIDED]";
        const statusText = status === "active"
            ? "Active 🔴"
            : "Resolved 🟢";

        // World detection logic
        let worldText = "[WORLD NOT FOUND]";
        let friendLocationRecord = null;
        let worldInfo = null;
        let joinLink = "";
        let worldName = "[WORLD NAME NOT FOUND]";
        // Always check the database for the user's current location
        const vrcUserId = "usr_6fefe5c1-6612-4e60-9b50-aa5f66b2460e"; // Placeholder: replace with actual mapping
        friendLocationRecord = await findFriendInstanceOrWorld(vrcUserId);
        // If a shortlink is provided, use it to backtrack to a working link
        if (world && (world.startsWith("https://vrc.group/") || world.startsWith("https://vrch.at/"))) {
            const match = world.match(/(?:vrc\.group|vrch\.at)\/([^/?#]+)/);
            const shortName = match ? match[1] : null;
            if (shortName) {
                const instanceInfo = await getInstanceInfoByShortName(shortName);
                worldName = instanceInfo?.world?.name || "[WORLD NAME NOT FOUND]";
                // Prefer nonce join link if available
                let instanceId = instanceInfo?.instanceId || instanceInfo?.id || "";
                if (typeof instanceId !== "string") instanceId = String(instanceId);
                if (instanceId.includes("nonce")) {
                    joinLink = `https://vrchat.com/home/launch?worldId=${instanceInfo.worldId}&instanceId=${instanceId}`;
                } else if (instanceInfo?.location && typeof instanceInfo.location === "string" && instanceInfo.location.includes("nonce")) {
                    joinLink = `https://vrchat.com/home/launch?worldId=${instanceInfo.worldId}&instanceId=${instanceInfo.location}`;
                } else if (instanceInfo.shortName) {
                    joinLink = `https://vrch.at/${instanceInfo.shortName}`;
                } else if (instanceInfo.secureName) {
                    joinLink = `https://vrch.at/${instanceInfo.secureName}`;
                }
                if (!joinLink) joinLink = world;
                worldText = `[${worldName}](${joinLink})`;
            }
        } else {

            

            // Database-based logic
            // Check if user is friended and has given consent
            const vrcUser = await getUserById(vrcUserId);
            if (!vrcUser || !vrcUser.isFriend) {
                await interaction.reply({
                    content: "You must be friended with CodixerBot to use location tracking.",
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }
            const consent = await hasFriendLocationConsent(vrcUserId); // Replace with CodixerBot's VRChat user ID
            if (!consent) {
                await interaction.reply({
                    content: "You must give consent to be tracked. Use `/vrchat locationtracking` to toggle tracking.",
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }
            if (!friendLocationRecord || !friendLocationRecord.location || friendLocationRecord.location === "offline" || friendLocationRecord.worldId === "offline") {
                await interaction.reply({
                    content: "User is offline or not tracked. Please try again when the user is online.",
                    flags: MessageFlags.Ephemeral,
                });
                return;
            } else if (friendLocationRecord.location === "private" && (!friendLocationRecord.worldId || friendLocationRecord.worldId === "private")) {
                await interaction.reply({
                    content: "User is in a private world or instance. Please provide a shortlink in the world parameter or send an invite to CodixerBot.",
                    flags: MessageFlags.Ephemeral,
                });
                return;
            } else if (friendLocationRecord.location === "private" && friendLocationRecord.worldId && friendLocationRecord.senderUserId) {
                // Get world info for name
                worldInfo = await getFriendInstanceInfo(vrcUserId);
                worldName = worldInfo?.world?.name || "[WORLD NAME NOT FOUND]";
                const senderProfileUrl = `https://vrchat.com/home/user/${friendLocationRecord.senderUserId}`;
                worldText = `${worldName} ([Request invite](<${senderProfileUrl}>))`;
            } else if (friendLocationRecord.location && friendLocationRecord.location !== "private") {
                // Get world info for name and instance
                worldInfo = await getFriendInstanceInfo(vrcUserId);
                worldName = worldInfo?.world?.name || "[WORLD NAME NOT FOUND]";
                const instanceId = friendLocationRecord.location;
                const worldId = friendLocationRecord.worldId;
                if (worldId && instanceId) {
                    joinLink = `https://vrchat.com/home/launch?worldId=${worldId}&instanceId=${instanceId}`;
                } else {
                    joinLink = "[NO UNLOCKED LINK FOUND]";
                }
                worldText = `[${worldName}](${joinLink})`;
            }
        }

        const replyMsg = `
${roleMention}
**Request**: ${requestType}
**World**: ${worldText}
**Situation**: ${situationText}
**Squad**: ${squadText}
**Status**: ${statusText}
        `.trim();

            // Send the message
        await interaction.reply({
            content: replyMsg,
            flags: MessageFlags.Ephemeral,
        });
    }
}

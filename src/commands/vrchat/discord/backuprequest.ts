import { Discord, Slash, SlashOption, SlashChoice } from "discordx";
import { CommandInteraction, ApplicationCommandOptionType, ApplicationIntegrationType, ActionRowBuilder, ButtonBuilder, ButtonStyle, Message, MessageFlags, InteractionContextType } from "discord.js";
import { getFriendInstanceInfo, getInstanceInfoByShortName } from "../../../utility/vrchat.js";

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

        // World detection logic
        let worldText = "[WORLD NOT FOUND]";
        let instanceIdText = "";
        let worldNameText = "";
        let worldJoinUrl = "";
        let instanceInfo = null;
        if (world && (world.startsWith("https://vrc.group/") || world.startsWith("https://vrch.at/"))) {
            // Extract shortName from the URL (supports both vrc.group and vrch.at)
            const match = world.match(/(?:vrc\.group|vrch\.at)\/([^/?#]+)/);
            const shortName = match ? match[1] : null;
            if (shortName) {
                instanceInfo = await getInstanceInfoByShortName(shortName);
            }
        } else if (!world) {
            // Try to get the user's current instance (assume interaction.user.id is VRChat userId)
            // You may need to map Discord user to VRChat userId in your actual implementation
            const vrcUserId = "usr_6fefe5c1-6612-4e60-9b50-aa5f66b2460e"; // Placeholder: replace with actual mapping
            instanceInfo = await getFriendInstanceInfo(vrcUserId);
        }
        if (instanceInfo) {
            worldNameText = instanceInfo.world?.name || "[WORLD NAME NOT FOUND]";
            instanceIdText = instanceInfo.instanceId || instanceInfo.id || "[INSTANCE ID NOT FOUND]";
            // Try to build a joinable link
            if (instanceInfo.shortName) {
                worldJoinUrl = `https://vrch.at/${instanceInfo.shortName}`;
            } else if (instanceInfo.secureName) {
                worldJoinUrl = `https://vrch.at/${instanceInfo.secureName}`;
            } else if (instanceInfo.instanceId || instanceInfo.id) {
                // If instanceId/id contains a nonce, it's joinable
                const idToUse = instanceInfo.instanceId || instanceInfo.id;
                if (idToUse.includes("nonce")) {
                    worldJoinUrl = `https://vrchat.com/home/launch?worldId=${instanceInfo.worldId}&instanceId=${idToUse}`;
                } else if (instanceInfo.location && instanceInfo.location.includes("nonce")) {
                    worldJoinUrl = `https://vrchat.com/home/launch?worldId=${instanceInfo.worldId}&instanceId=${instanceInfo.location}`;
                }
            }
            // If no joinable link, show NOT FOUND
            if (!worldJoinUrl) {
                worldJoinUrl = "[NO UNLOCKED LINK FOUND]";
            }
            worldText = `${worldNameText} (${instanceIdText})\n${worldJoinUrl}`;
        } else if (world && !(world.startsWith("https://vrc.group/") || world.startsWith("https://vrch.at/"))) {
            worldText = world;
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

        const replyMsg = `\
${roleMention}
**Request**: ${requestType}
**World**: ${worldText}
**Situation**: ${situationText}
**Squad**: ${squadText}
**Status**: ${statusText}
\
        `.trim();

        await interaction.reply({
            content: replyMsg,
        });
    }

}

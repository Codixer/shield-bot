import { Discord, Slash, SlashOption, SlashChoice, Guard, SlashGroup } from "discordx";
import { CommandInteraction, ApplicationCommandOptionType, ApplicationIntegrationType, ActionRowBuilder, ButtonBuilder, ButtonStyle, Message, MessageFlags, InteractionContextType, AutocompleteInteraction } from "discord.js";
import { findFriendInstanceOrWorld, getFriendInstanceInfo, getInstanceInfoByShortName, getUserById, hasFriendLocationConsent } from "../../utility/vrchat.js";
import { VRChatLoginGuard } from "../../utility/guards.js";
import { ShieldMemberGuard } from "../../utility/guards.js";
import { prisma } from "../../main.js";
import { extractInstanceNumber, resolveWorldDisplay } from "../../utility/vrchat/tracking.js";

@Discord()
@SlashGroup({
  description: "Backup request commands",
  name: "backup",
  root: "vrchat"
})
@SlashGroup("backup", "vrchat")
@Guard(VRChatLoginGuard)
@Guard(ShieldMemberGuard)
export default class BackupRequestCommand {
    @Slash({
        name: "backup-request",
        description: "Request a backup for SHIELD.",
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
        @SlashOption({
            name: "account",
            description: "Account to use for this request (if not provided, will use the main verified account)",
            type: ApplicationCommandOptionType.String,
            required: false,
            autocomplete: true,
        }) account: string | null,
        interaction: CommandInteraction | AutocompleteInteraction,
    ) {
        if (interaction.isAutocomplete()) {
            return this.autocompleteAccount(interaction);
        }

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
        let worldName = "[WORLD NAME NOT FOUND]";
        let joinLink = "";
        let instanceNumber: string | undefined = undefined;
        // Use selected account or default to MAIN
        let vrcUserId: string | null = account;
        let accountUsername: string | null = null;
        if (!vrcUserId) {
            const user = await prisma.user.findUnique({
                where: { discordId: interaction.user.id },
                include: { vrchatAccounts: true }
            });
            const mainAccount = user?.vrchatAccounts.find((acc: any) => acc.accountType === "MAIN");
            vrcUserId = mainAccount?.vrcUserId ?? (user?.vrchatAccounts.find((acc: any) => acc.accountType === "MAIN" || acc.accountType === "ALT")?.vrcUserId ?? null);
            if (mainAccount?.vrcUserId) {
                const vrcUser = await getUserById(mainAccount.vrcUserId);
                accountUsername = vrcUser?.displayName ?? null;
            }
        } else {
            // If account is provided, get its username from VRChat API
            const vrcUser = await getUserById(vrcUserId);
            accountUsername = vrcUser?.displayName ?? null;
        }
        if (!vrcUserId) {
            await interaction.reply({
                content: "No verified VRChat account found for this request.",
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        const worldResult = await resolveWorldDisplay({
            world,
            vrcUserId,
            accountUsername,
            findFriendInstanceOrWorld,
            getFriendInstanceInfo,
            getInstanceInfoByShortName,
            getUserById,
            hasFriendLocationConsent
        });
        worldText = worldResult.worldText;
        worldName = worldResult.worldName;
        joinLink = worldResult.joinLink;
        instanceNumber = worldResult.instanceNumber;

        const replyMsg = `\`\`\`
${roleMention}
**Request**: ${requestType}
**World**: ${worldText}
**Situation**: ${situationText}
**Squad**: ${squadText}
**Status**: ${statusText}
\`\`\`
`.trim();

            // Send the message
        const sentMsg = await interaction.reply({
            content: replyMsg,
            flags: MessageFlags.Ephemeral
        });
    }

    async autocompleteAccount(interaction: AutocompleteInteraction) {
        const discordId = interaction.user.id;
        // Get all verified VRChat accounts for this user
        const user = await prisma.user.findUnique({
            where: { discordId },
            include: { vrchatAccounts: true }
        });
        if (!user || !user.vrchatAccounts) {
            return await interaction.respond([]);
        }
        // Only show accounts that are verified and have given consent
        const choices = [];
        for (const acc of user.vrchatAccounts) {
            if (acc.accountType === "UNVERIFIED") continue;
            const consent = await prisma.friendLocationConsent.findFirst({
                where: { ownerVrcUserId: acc.vrcUserId }
            });
            if (consent) {
                // Fetch username from VRChat API
                let username = acc.vrcUserId;
                try {
                    const vrcUser = await getUserById(acc.vrcUserId);
                    if (vrcUser?.displayName) username = vrcUser.displayName;
                } catch {}
                choices.push({
                    name: `${username} (${acc.accountType || "Account"})`,
                    value: acc.vrcUserId
                });
            }
        }
        // If no choices, show MAIN if available
        if (choices.length === 0) {
            const main = user.vrchatAccounts.find((acc: any) => acc.accountType === "MAIN");
            if (main) {
                let username = main.vrcUserId;
                try {
                    const vrcUser = await getUserById(main.vrcUserId);
                    if (vrcUser?.displayName) username = vrcUser.displayName;
                } catch {}
                choices.push({ name: `${username} (MAIN)`, value: main.vrcUserId });
            }
        }
        return await interaction.respond(choices.slice(0, 25));
    }
}

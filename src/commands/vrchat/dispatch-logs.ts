import { Discord, Slash, SlashOption, SlashChoice, Guard, SlashGroup } from "discordx";
import { CommandInteraction, ApplicationCommandOptionType, ApplicationIntegrationType, MessageFlags, InteractionContextType, AutocompleteInteraction } from "discord.js";
import { findFriendInstanceOrWorld, getFriendInstanceInfo, getInstanceInfoByShortName, getUserById, hasFriendLocationConsent } from "../../utility/vrchat";
import { VRChatLoginGuard } from "../../utility/guards";
import { prisma } from "../../main";

@Discord()
@SlashGroup({
  name: "vrchat",
  description: "VRChat related commands.",
  contexts: [InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  integrationTypes: [ApplicationIntegrationType.UserInstall]
})
@SlashGroup("vrchat")
@Guard(VRChatLoginGuard)
export default class DispatchLogsCommand {
    @Slash({
        name: "dispatchlog",
        description: "Log a dispatch event for SHIELD."
    })
    async dispatchLog(
        @SlashChoice({ name: "Deputies", value: "999860674404569242" })
        @SlashChoice({ name: "TRU", value: "999860876062498827" })
        @SlashChoice({ name: "EMT", value: "999860757770543184" })
        @SlashOption({
            name: "request",
            description: "What role to log (Deputies, TRU, EMT)",
            type: ApplicationCommandOptionType.String,
            required: true,
        }) request: string,
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

        // Use request directly as roleId
        const roleId = request;
        let squadChannelMention = "";
        if (squad) {
            squadChannelMention = `<#${squad}>`;
        }
        const requestType =
            roleId === "999860674404569242"
                ? "Deputies"
                : roleId === "999860757770543184"
                ? "EMT"
                : roleId === "999860876062498827"
                ? "TRU"
                : "Dispatch";
        const situationText = situation ? situation : "[SITUATION NOT PROVIDED]";
        const squadText = squadChannelMention ? squadChannelMention : "[SQUAD NOT PROVIDED]";
        const statusText = status === "active"
            ? "Active 🔴"
            : "Resolved 🟢";

        // World detection logic (same as backuprequest)
        let worldText = "[WORLD NOT FOUND]";
        let friendLocationRecord = null;
        let worldInfo = null;
        let joinLink = "";
        let worldName = "[WORLD NAME NOT FOUND]";
        let vrcUserId: string | null = account;
        let accountUsername: string | null = null;
        if (!vrcUserId) {
            const user = await prisma.user.findUnique({
                where: { discordId: interaction.user.id },
                include: { vrchatAccounts: true }
            });
            const mainAccount = user?.vrchatAccounts.find(acc => acc.verified && acc.accountType === "MAIN");
            vrcUserId = mainAccount?.vrcUserId ?? (user?.vrchatAccounts.find(acc => acc.verified)?.vrcUserId ?? null);
            if (mainAccount?.vrcUserId) {
                const vrcUser = await getUserById(mainAccount.vrcUserId);
                accountUsername = vrcUser?.displayName ?? null;
            }
        } else {
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
        friendLocationRecord = await findFriendInstanceOrWorld(vrcUserId);
        if (world && (world.startsWith("https://vrc.group/") || world.startsWith("https://vrch.at/"))) {
            const match = world.match(/(?:vrc\.group|vrch\.at)\/([^/?#]+)/);
            const shortName = match ? match[1] : null;
            if (shortName) {
                const instanceInfo = await getInstanceInfoByShortName(shortName);
                worldName = instanceInfo?.world?.name || "[WORLD NAME NOT FOUND]";
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
            const vrcUser = await getUserById(vrcUserId);
            if (!vrcUser || !vrcUser.isFriend) {
                await interaction.reply({
                    content: "You must be friended with CodixerBot to use location tracking.",
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }
            const consent = await hasFriendLocationConsent(vrcUserId);
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
                worldInfo = await getFriendInstanceInfo(vrcUserId);
                worldName = worldInfo?.world?.name || "[WORLD NAME NOT FOUND]";
                const senderProfileUrl = `https://vrchat.com/home/user/${friendLocationRecord.senderUserId}`;
                worldText = `${worldName} ([Request invite from ${accountUsername}](<${senderProfileUrl}>))`;
            } else if (friendLocationRecord.location && friendLocationRecord.location !== "private") {
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

        const replyMsg = `\u0060\u0060\u0060\nWorld: ${worldText}\nRequest: ${requestType}\nSituation: ${situationText}\nSquad: ${squadText}\nStatus: ${statusText}\n\u0060\u0060\u0060`;
        await interaction.reply({
            content: replyMsg,
            flags: MessageFlags.Ephemeral,
        });
    }

    async autocompleteAccount(interaction: AutocompleteInteraction) {
        const discordId = interaction.user.id;
        const user = await prisma.user.findUnique({
            where: { discordId },
            include: { vrchatAccounts: true }
        });
        if (!user || !user.vrchatAccounts) {
            return await interaction.respond([]);
        }
        const choices = [];
        for (const acc of user.vrchatAccounts) {
            if (!acc.verified) continue;
            const consent = await prisma.friendLocationConsent.findFirst({
                where: { ownerVrcUserId: acc.vrcUserId }
            });
            if (consent) {
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
        if (choices.length === 0) {
            const main = user.vrchatAccounts.find(acc => acc.verified && acc.accountType === "MAIN");
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

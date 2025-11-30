import {
  Discord,
  Slash,
  SlashOption,
  SlashChoice,
  Guard,
  SlashGroup,
} from "discordx";
import {
  CommandInteraction,
  ApplicationCommandOptionType,
  MessageFlags,
  InteractionContextType,
  ApplicationIntegrationType,
  AutocompleteInteraction,
} from "discord.js";
import {
  findFriendInstanceOrWorld,
  getFriendInstanceInfo,
  getInstanceInfoByShortName,
  getUserById,
  hasFriendLocationConsent,
} from "../../../utility/vrchat.js";
import { VRChatLoginGuard } from "../../../utility/guards.js";
import { ShieldMemberGuard } from "../../../utility/guards.js";
import { prisma } from "../../../main.js";
import {
  resolveWorldDisplay,
} from "../../../utility/vrchat/tracking.js";

@Discord()
@SlashGroup({
  name: "vrchat",
  description: "VRChat related commands.",
  contexts: [
    InteractionContextType.Guild,
  ],
  integrationTypes: [
    ApplicationIntegrationType.GuildInstall,
  ],
})
@SlashGroup("vrchat")
@Guard(VRChatLoginGuard)
export class VRChatBackupRequestCommand {
  @Slash({
    name: "backup-request",
    description: "Request a backup for SHIELD.",
  })
  @Guard(ShieldMemberGuard)
  async backupRequest(
    @SlashOption({
      name: "role",
      description:
        "What role to ping/request (searches available server roles)",
      type: ApplicationCommandOptionType.String,
      required: true,
      autocomplete: true,
    })
    role: string,
    @SlashOption({
      name: "situation",
      description: "Current Situation. Hostage, Active Shooter, Etc",
      type: ApplicationCommandOptionType.String,
      required: true,
    })
    situation: string,
    @SlashOption({
      name: "squad",
      description: "Squad channel (searches enrolled squad channels)",
      type: ApplicationCommandOptionType.String,
      required: true,
      autocomplete: true,
    })
    squad: string,
    @SlashChoice({ name: "Active (🔴)", value: "active" })
    @SlashChoice({ name: "Resolved (🟢)", value: "resolved" })
    @SlashOption({
      name: "status",
      description: "Status",
      type: ApplicationCommandOptionType.String,
      required: true,
    })
    status: string,
    @SlashOption({
      name: "world",
      description: "World Link or Detected over vrc account",
      type: ApplicationCommandOptionType.String,
      required: false,
    })
    world: string,
    @SlashOption({
      name: "account",
      description:
        "Account to use for this request (if not provided, will use the main verified account)",
      type: ApplicationCommandOptionType.String,
      required: false,
      autocomplete: true,
    })
    account: string | null,
    interaction: CommandInteraction | AutocompleteInteraction,
  ) {
    if (interaction.isAutocomplete()) {
      return this.autocompleteAccount(interaction);
    }

    // Use role directly as roleId
    const roleId = role;

    // Use squad as the channel ID directly
    const channelId = squad;

    // Use status directly
    const incidentStatus = status;

    // Get the user's main account if no account specified
    let vrcUserId = account;
    let accountUsername: string | null = null;
    if (!vrcUserId) {
      const user = await prisma.user.findUnique({
        where: { discordId: interaction.user.id },
        include: { vrchatAccounts: true },
      });
      if (user && user.vrchatAccounts.length > 0) {
        const mainAccount = user.vrchatAccounts.find(
          (acc) => acc.accountType === "MAIN",
        );
        vrcUserId = mainAccount
          ? mainAccount.vrcUserId
          : user.vrchatAccounts[0].vrcUserId;
        if (mainAccount) {
          const vrcUser = await getUserById(mainAccount.vrcUserId);
          accountUsername = vrcUser?.displayName ?? null;
        }
      }
    } else {
      // If account is provided, get its username from VRChat API
      const vrcUser = await getUserById(vrcUserId);
      accountUsername = vrcUser?.displayName ?? null;
    }

    if (!vrcUserId) {
      await interaction.reply({
        content: "No VRChat account found. Please verify your account first.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get user info
    const vrcUser = await getUserById(vrcUserId);
    if (!vrcUser) {
      await interaction.reply({
        content: "Could not find VRChat user information.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get world info if provided
    let worldInfo = "";
    if (world) {
      const worldResult = await resolveWorldDisplay({
        world,
        vrcUserId,
        accountUsername,
        findFriendInstanceOrWorld,
        getFriendInstanceInfo,
        getInstanceInfoByShortName,
        getUserById,
        hasFriendLocationConsent,
      });
      worldInfo = worldResult.worldText;
    }

    // Create reply message
    const roleMention = `<@&${roleId}>`;
    const requestType =
      roleId === "814239954641223760"
        ? "EMT"
        : roleId === "999860876062498827"
          ? "TRU"
          : "Backup";
    const squadText = `<#${channelId}>`;
    const statusText =
      incidentStatus === "active" ? "Active 🔴" : "Resolved 🟢";
    const situationText = situation || "[SITUATION NOT PROVIDED]";

    const replyMsg = `\`\`\`
${roleMention}
**Request**: ${requestType}
**World**: ${world ? worldInfo : "[WORLD NOT PROVIDED]"}
**Situation**: ${situationText}
**Squad**: ${squadText}
**Status**: ${statusText}
\`\`\``;

    await interaction.reply({ content: replyMsg });
  }

  private async autocompleteAccount(interaction: AutocompleteInteraction) {
    const focused = interaction.options.getFocused(true);

    if (focused.name === "role") {
      // Get available roles from the guild
      if (!interaction.guildId || !interaction.guild) return;
      const guild = interaction.guild;
      const choices = [];

      for (const [roleId, role] of guild.roles.cache) {
        if (role.name.toLowerCase().includes(focused.value.toLowerCase())) {
          choices.push({ name: role.name, value: roleId });
        }
      }

      await interaction.respond(choices.slice(0, 25));
      return;
    }

    if (focused.name === "squad") {
      // Use the same logic as attendance system for squad channels
      if (!interaction.guildId) return;
      const settings = await prisma.guildSettings.findUnique({
        where: { guildId: interaction.guildId },
      });
      const enrolled = (settings?.enrolledChannels as string[]) || [];
      const guild = interaction.guild;
      if (!guild) return;
      const choices = [];
      for (const channelId of enrolled) {
        const channel = guild.channels.cache.get(channelId);
        if (
          channel &&
          channel.name.toLowerCase().includes(focused.value.toLowerCase())
        ) {
          choices.push({ name: channel.name, value: channelId });
        }
      }
      await interaction.respond(choices.slice(0, 25));
      return;
    }

    if (focused.name === "account") {
      const user = await prisma.user.findUnique({
        where: { discordId: interaction.user.id },
        include: { vrchatAccounts: true },
      });

      if (!user || !user.vrchatAccounts) {
        return;
      }

      const choices = user.vrchatAccounts.map((acc) => ({
        name: `${acc.vrchatUsername || acc.vrcUserId} (${acc.accountType})`,
        value: acc.vrcUserId,
      }));

      await interaction.respond(choices.slice(0, 25));
    }
  }
}

import { Discord, Slash, SlashGroup } from "discordx";
import {
  CommandInteraction,
  EmbedBuilder,
  Colors,
  MessageFlags,
} from "discord.js";
import { prisma } from "../../../main.js";
import { groupRoleSyncManager } from "../../../managers/groupRoleSync/groupRoleSyncManager.js";
import { loggers } from "../../../utility/logger.js";

@Discord()
@SlashGroup({ name: "group", description: "VRChat group commands" })
@SlashGroup("group")
export class GroupSelfRoleSyncCommand {
  @Slash({
    name: "syncme",
    description: "Sync your Discord roles to your VRChat group roles",
  })
  async selfRoleSync(interaction: CommandInteraction): Promise<void> {
    try {
      if (!interaction.guildId) {
        await interaction.reply({
          content: "❌ This command can only be used in a server.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // Get the VRChat group ID from guild settings
      const guildSettings = await prisma.guildSettings.findUnique({
        where: { guildId: interaction.guildId },
      });

      if (!guildSettings?.vrcGroupId) {
        await interaction.editReply({
          content: "❌ No VRChat group configured for this server.",
        });
        return;
      }

      // Get user's verified VRChat account
      const user = await prisma.user.findUnique({
        where: { discordId: interaction.user.id },
        include: {
          vrchatAccounts: {
            where: { accountType: { in: ["MAIN", "ALT"] } },
          },
        },
      });

      if (!user || user.vrchatAccounts.length === 0) {
        await interaction.editReply({
          content:
            "❌ You don't have a verified VRChat account. Please verify your account first using `/verify account`.",
        });
        return;
      }

      // Use the main account if available, otherwise first verified account
      const mainAccount = user.vrchatAccounts.find(
        (acc) => acc.accountType === "MAIN",
      );
      const vrcAccount = mainAccount || user.vrchatAccounts[0];

      // Sync roles
      await groupRoleSyncManager.syncUserRoles(
        interaction.guildId,
        interaction.user.id,
        vrcAccount.vrcUserId,
      );

      const embed = new EmbedBuilder()
        .setTitle("✅ Roles Synced!")
        .setDescription(
          `Your VRChat group roles have been synchronized with your Discord roles.\n\n**Account:** ${vrcAccount.vrchatUsername || vrcAccount.vrcUserId}`,
        )
        .setColor(Colors.Green)
        .setFooter({ text: "S.H.I.E.L.D. Bot - Group Role Sync" })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error: any) {
      loggers.vrchat.error("Self Role Sync error", error);

      let errorMessage = "Failed to sync roles. Please try again later.";
      if (error.message?.includes("not in group")) {
        errorMessage =
          "You are not a member of the VRChat group yet. Please join the group first using `/group join`.";
      } else if (
        error.message?.includes("403") ||
        error.message?.includes("401")
      ) {
        errorMessage = "Bot does not have permission to manage group roles.";
      }

      const embed = new EmbedBuilder()
        .setTitle("❌ Role Sync Failed")
        .setDescription(errorMessage)
        .setColor(Colors.Red)
        .setFooter({ text: "S.H.I.E.L.D. Bot - Group Role Sync" });

      await interaction.editReply({ embeds: [embed] });
    }
  }
}

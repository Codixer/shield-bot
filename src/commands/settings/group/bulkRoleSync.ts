import { Discord, Guard, Slash, SlashGroup, SlashOption } from "discordx";
import {
  CommandInteraction,
  ApplicationCommandOptionType,
  EmbedBuilder,
  Colors,
} from "discord.js";
import { StaffGuard } from "../../../utility/guards.js";
import { prisma } from "../../../main.js";
import { groupRoleSyncManager } from "../../../managers/groupRoleSync/groupRoleSyncManager.js";

@Discord()
@SlashGroup({ name: "group", description: "VRChat group management" })
@SlashGroup("group")
@Guard(StaffGuard)
export class GroupBulkRoleSyncCommand {
  @Slash({
    name: "bulkrolesync",
    description: "Sync Discord roles to VRChat group roles for all verified users",
  })
  async bulkSyncRoles(
    @SlashOption({
      name: "dry_run",
      description: "Preview changes without applying them (default: false)",
      type: ApplicationCommandOptionType.Boolean,
      required: false,
    })
    dryRun: boolean = false,
    interaction: CommandInteraction,
  ): Promise<void> {
    try {
      if (!interaction.guildId) {
        await interaction.reply({
          content: "❌ This command can only be used in a server.",
          ephemeral: true,
        });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      // Check if VRChat group is configured
      const settings = await prisma.guildSettings.findUnique({
        where: { guildId: interaction.guildId },
      });

      if (!settings?.vrcGroupId) {
        await interaction.editReply({
          content:
            "❌ No VRChat group ID configured. Please set it first using `/settings group set-group-id`.",
        });
        return;
      }

      // Check if there are any role mappings configured
      const mappingsCount = await prisma.groupRoleMapping.count({
        where: { guildId: interaction.guildId },
      });

      if (mappingsCount === 0) {
        await interaction.editReply({
          content:
            "❌ No role mappings configured. Please configure role mappings using `/group role map`.",
        });
        return;
      }

      // Get all guild members
      const guild = await interaction.guild?.fetch();
      if (!guild) {
        await interaction.editReply({
          content: "❌ Could not fetch guild information.",
        });
        return;
      }

      // Fetch all members to ensure we have the full list
      await guild.members.fetch();

      // Get all verified VRChat accounts for users in this guild
      const verifiedAccounts = await prisma.vRChatAccount.findMany({
        where: {
          accountType: { in: ["MAIN", "ALT"] },
          user: {
            discordId: {
              in: Array.from(guild.members.cache.keys()),
            },
          },
        },
        include: { user: true },
      });

      if (verifiedAccounts.length === 0) {
        await interaction.editReply({
          content: "ℹ️ No verified VRChat accounts found for members in this server.",
        });
        return;
      }

      const statusEmbed = new EmbedBuilder()
        .setTitle(
          dryRun
            ? "🔍 Bulk Role Sync - Dry Run"
            : "🔄 Bulk Role Sync - In Progress",
        )
        .setDescription(
          `${dryRun ? "Analyzing" : "Syncing"} roles for ${verifiedAccounts.length} verified account(s)...\n\nThis may take a while.`,
        )
        .setColor(Colors.Blue)
        .setTimestamp();

      await interaction.editReply({ embeds: [statusEmbed] });

      // Track results
      const results = {
        success: 0,
        failed: 0,
        skipped: 0,
        errors: [] as string[],
      };

      // Sync each verified account
      for (const vrcAccount of verifiedAccounts) {
        try {
          const member = guild.members.cache.get(vrcAccount.user.discordId);
          if (!member) {
            results.skipped++;
            continue;
          }

          if (!dryRun) {
            await groupRoleSyncManager.syncUserRoles(
              interaction.guildId,
              vrcAccount.user.discordId,
              vrcAccount.vrcUserId,
            );
            
            // Wait 500ms between users to prevent rate limiting
            await new Promise(resolve => setTimeout(resolve, 500));
          }

          results.success++;

          // Update progress every 10 accounts
          if ((results.success + results.failed + results.skipped) % 10 === 0) {
            const progressEmbed = new EmbedBuilder()
              .setTitle(
                dryRun
                  ? "🔍 Bulk Role Sync - Dry Run"
                  : "🔄 Bulk Role Sync - In Progress",
              )
              .setDescription(
                `Processed: ${results.success + results.failed + results.skipped}/${verifiedAccounts.length}\n` +
                  `✅ Success: ${results.success}\n` +
                  `❌ Failed: ${results.failed}\n` +
                  `⏭️ Skipped: ${results.skipped}`,
              )
              .setColor(Colors.Blue)
              .setTimestamp();

            await interaction.editReply({ embeds: [progressEmbed] });
          }
        } catch (error: any) {
          results.failed++;
          const errorMsg = `${vrcAccount.vrchatUsername || vrcAccount.vrcUserId}: ${error.message}`;
          if (results.errors.length < 5) {
            // Only store first 5 errors
            results.errors.push(errorMsg);
          }
          console.error(
            `[BulkRoleSync] Error syncing ${vrcAccount.vrcUserId}:`,
            error,
          );
        }
      }

      // Final results
      const finalEmbed = new EmbedBuilder()
        .setTitle(
          dryRun ? "🔍 Bulk Role Sync - Dry Run Complete" : "✅ Bulk Role Sync Complete",
        )
        .setDescription(
          dryRun
            ? `Analyzed ${verifiedAccounts.length} verified account(s). No changes were made.`
            : `Synced roles for ${verifiedAccounts.length} verified account(s).`,
        )
        .addFields(
          {
            name: "✅ Successful",
            value: results.success.toString(),
            inline: true,
          },
          { name: "❌ Failed", value: results.failed.toString(), inline: true },
          { name: "⏭️ Skipped", value: results.skipped.toString(), inline: true },
        )
        .setColor(results.failed > 0 ? Colors.Orange : Colors.Green)
        .setFooter({ text: "S.H.I.E.L.D. Bot - Group Role Sync" })
        .setTimestamp();

      if (results.errors.length > 0) {
        finalEmbed.addFields({
          name: "⚠️ Sample Errors",
          value: results.errors.map((e) => `• ${e}`).join("\n").slice(0, 1024),
        });
      }

      if (dryRun) {
        finalEmbed.addFields({
          name: "ℹ️ Next Steps",
          value: "Run `/group bulkrolesync dry_run:false` to apply these changes.",
        });
      }

      await interaction.editReply({ embeds: [finalEmbed] });
    } catch (error: any) {
      console.error("[BulkRoleSync] Error:", error);
      await interaction.editReply({
        content: `❌ Failed to perform bulk sync: ${error.message}`,
      });
    }
  }
}

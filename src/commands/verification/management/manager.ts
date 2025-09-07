import { Discord, Slash, Guard, SlashGroup } from "discordx";
import { CommandInteraction, MessageFlags, EmbedBuilder, Colors, ButtonBuilder, ButtonStyle, ActionRowBuilder, InteractionContextType, ApplicationIntegrationType } from "discord.js";
import { BotOwnerGuard } from "../../../utility/guards.js";
import { prisma } from "../../../main.js";

@Discord()
@SlashGroup({
  name: "verify",
  description: "VRChat verification commands.",
  contexts: [InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  integrationTypes: [ApplicationIntegrationType.UserInstall, ApplicationIntegrationType.GuildInstall]
})
@SlashGroup("verify")
@Guard(BotOwnerGuard)
export class VRChatVerifyManagerCommand {

  @Slash({
    name: "manager",
    description: "Manage verification status of VRChat accounts (Bot Owner only).",
  })
  async manager(interaction: CommandInteraction) {
    const user = await prisma.user.findUnique({
      where: { discordId: interaction.user.id },
      include: { vrchatAccounts: true }
    });

    if (!user) {
      await interaction.reply({
        content: "❌ User not found in database.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // Filter to only show accounts that can be managed
    const manageableAccounts = user.vrchatAccounts.filter((acc: any) =>
      acc.accountType === "MAIN" || acc.accountType === "ALT" || acc.accountType === "UNVERIFIED"
    );

    if (manageableAccounts.length === 0) {
      await interaction.reply({
        content: "❌ No VRChat accounts found that can be managed.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("🔧 VRChat Account Manager")
      .setDescription("Select an account and action to perform:")
      .setColor(Colors.Blue)
      .setFooter({ text: "Bot Owner Management Tool" });

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];

    for (let i = 0; i < manageableAccounts.length; i += 4) {
      const row = new ActionRowBuilder<ButtonBuilder>();

      for (let j = i; j < Math.min(i + 4, manageableAccounts.length); j++) {
        const acc = manageableAccounts[j];
        const accountType = acc.accountType === "MAIN" ? "⭐" :
                           acc.accountType === "ALT" ? "🔸" : "❓";

        // Verify button
        if (acc.accountType === "UNVERIFIED" || acc.accountType === "IN_VERIFICATION") {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`verify-account:${acc.vrcUserId}`)
              .setLabel(`${accountType} Verify ${acc.vrchatUsername || acc.vrcUserId}`)
              .setStyle(ButtonStyle.Success)
          );
        } else {
          // Set as Main/Alt buttons for verified accounts
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`set-main:${acc.vrcUserId}`)
              .setLabel(`${accountType} Set Main`)
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId(`set-alt:${acc.vrcUserId}`)
              .setLabel(`🔸 Set Alt`)
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId(`unverify-account:${acc.vrcUserId}`)
              .setLabel(`❌ Unverify`)
              .setStyle(ButtonStyle.Danger)
          );
        }
      }

      rows.push(row);
    }

    await interaction.reply({
      embeds: [embed],
      components: rows,
      flags: MessageFlags.Ephemeral
    });
  }
}

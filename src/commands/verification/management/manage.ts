import { Discord, Slash, Guard, SlashGroup } from "discordx";
import { CommandInteraction, MessageFlags, EmbedBuilder, Colors, ButtonBuilder, ButtonStyle, ActionRowBuilder, InteractionContextType, ApplicationIntegrationType } from "discord.js";
import { VRChatLoginGuard } from "../../../utility/guards.js";
import { prisma } from "../../../main.js";
import { getUserById } from "../../../utility/vrchat/user.js";

@Discord()
@SlashGroup({
  name: "verify",
  description: "VRChat verification commands.",
  contexts: [InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  integrationTypes: [ApplicationIntegrationType.UserInstall, ApplicationIntegrationType.GuildInstall]
})
@SlashGroup("verify")
@Guard(VRChatLoginGuard)
export class VRChatVerifyManageCommand {

  @Slash({
    name: "manage",
    description: "Manage your linked VRChat accounts (alias for /verify accounts)."
  })
  async manage(interaction: CommandInteraction) {
    const discordId = interaction.user.id;

    try {
      // Get user and their VRChat accounts
      const user = await prisma.user.findUnique({
        where: { discordId },
        include: { vrchatAccounts: true }
      });

      if (!user) {
        await interaction.reply({
          content: "❌ User not found in database.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (!user.vrchatAccounts || user.vrchatAccounts.length === 0) {
        await interaction.reply({
          content: "❌ You don't have any VRChat accounts linked to your Discord account.\n\nUse `/verify account` to link your first VRChat account!",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // Filter to only verified accounts (MAIN and ALT)
      const verifiedAccounts = user.vrchatAccounts.filter((acc: any) =>
        acc.accountType === "MAIN" || acc.accountType === "ALT"
      );

      if (verifiedAccounts.length === 0) {
        const embed = new EmbedBuilder()
          .setTitle("🔗 VRChat Account Management")
          .setDescription("You have VRChat accounts linked, but none are fully verified yet.")
          .setColor(Colors.Yellow)
          .addFields(
            { name: "📋 Your Accounts", value: user.vrchatAccounts.map((acc: any) => {
              const status = acc.accountType === "UNVERIFIED" ? "❓ Unverified" :
                           acc.accountType === "IN_VERIFICATION" ? "⏳ In Verification" : "❓ Unknown";
              return `• ${acc.vrchatUsername || acc.vrcUserId} - ${status}`;
            }).join("\n"), inline: false },
            { name: "💡 Next Steps", value: "Use `/verify account` to verify your accounts and gain access to account management.", inline: false }
          )
          .setFooter({ text: "Complete verification to manage your accounts" });

        await interaction.reply({
          embeds: [embed],
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // Build the account manager interface using the same logic as the button handler
      const embed = new EmbedBuilder()
        .setTitle("🔧 VRChat Account Manager")
        .setDescription("Manage your verified VRChat accounts:")
        .setColor(Colors.Blue)
        .setFooter({ text: "Use the buttons below to manage your accounts" });

      const rows: ActionRowBuilder<ButtonBuilder>[] = [];

      // Add info button row
      const infoRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Secondary)
            .setLabel("ℹ️ Info")
            .setDisabled(true)
            .setCustomId("accountmanager:info")
        );
      rows.push(infoRow);

      // Build usernames map
      const usernames: Record<string, string> = {};
      for (const acc of verifiedAccounts) {
        try {
          const vrcUser = await getUserById(acc.vrcUserId);
          usernames[acc.vrcUserId] = vrcUser?.displayName || acc.vrcUserId;
        } catch {
          usernames[acc.vrcUserId] = acc.vrcUserId;
        }
      }

      // Create account management buttons
      for (let i = 0; i < verifiedAccounts.length; i++) {
        const acc = verifiedAccounts[i];
        const displayName = usernames[acc.vrcUserId] || acc.vrcUserId;
        const isMain = acc.accountType === "MAIN";
        const isAlt = acc.accountType === "ALT";

        // Check consent status
        const consent = await prisma.friendLocationConsent.findFirst({
          where: { ownerVrcUserId: acc.vrcUserId }
        });
        const consentStatus = consent ? "📍 Tracking: Enabled" : "🚫 Tracking: Disabled";

        // Create account info embed field
        embed.addFields({
          name: `${isMain ? '⭐' : '🔸'} ${displayName}`,
          value: `• Status: ${isMain ? 'MAIN' : 'ALT'}\n• ${consentStatus}\n• [View Profile](https://vrchat.com/home/user/${acc.vrcUserId})`,
          inline: true
        });

        // Button color/enable logic
        let mainBtnStyle = ButtonStyle.Primary;
        let mainBtnDisabled = false;
        let altBtnStyle = ButtonStyle.Secondary;
        let altBtnDisabled = false;

        if (isMain) {
          mainBtnStyle = ButtonStyle.Success; // Green
          mainBtnDisabled = true;
          altBtnStyle = ButtonStyle.Secondary; // Gray
          altBtnDisabled = false;
        } else if (isAlt) {
          mainBtnStyle = ButtonStyle.Secondary; // Gray
          mainBtnDisabled = false;
          altBtnStyle = ButtonStyle.Primary; // Blue
          altBtnDisabled = true;
        }

        // Create button row for this account
        const buttonRow = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setStyle(mainBtnStyle)
              .setLabel("Set Main")
              .setDisabled(mainBtnDisabled)
              .setCustomId(`accountmanager:main:${acc.vrcUserId}`),
            new ButtonBuilder()
              .setStyle(altBtnStyle)
              .setLabel("Set Alt")
              .setDisabled(altBtnDisabled)
              .setCustomId(`accountmanager:alt:${acc.vrcUserId}`),
            new ButtonBuilder()
              .setStyle(ButtonStyle.Danger)
              .setLabel("Unlink")
              .setCustomId(`accountmanager:delete:${acc.vrcUserId}`)
          );
        rows.push(buttonRow);
      }

      await interaction.reply({
        embeds: [embed],
        components: rows,
        flags: MessageFlags.Ephemeral
      });

    } catch (error) {
      console.error("Error in manage command:", error);
      await interaction.reply({
        content: "❌ An error occurred while loading your accounts. Please try again later.",
        flags: MessageFlags.Ephemeral
      });
    }
  }
}

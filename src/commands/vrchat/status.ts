import { Discord, Slash, SlashGroup, Guard } from "discordx";
import { CommandInteraction, MessageFlags, EmbedBuilder, Colors, ApplicationIntegrationType, InteractionContextType } from "discord.js";
import { VRChatLoginGuard } from "../../utility/guards.js";
import { getVRChatAccountStatus } from "../../utility/vrchat/user.js";

@Discord()
@SlashGroup({
  name: "vrchat",
  description: "VRChat related commands.",
  contexts: [InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  integrationTypes: [ApplicationIntegrationType.UserInstall, ApplicationIntegrationType.GuildInstall]
})
@SlashGroup("vrchat")
@Guard(VRChatLoginGuard)
export class VRChatStatusCommand {
  @Slash({
    name: "status",
    description: "Check your VRChat account binding and verification status.",
  })
  async status(interaction: CommandInteraction) {
    const status = await getVRChatAccountStatus(interaction.user.id);
    
    const embed = new EmbedBuilder()
      .setTitle("🔗 Your VRChat Account Status")
      .setColor(status.hasVerifiedAccount ? Colors.Green : status.hasBoundAccount ? Colors.Yellow : Colors.Red);

    if (!status.hasBoundAccount) {
      embed.setDescription("❌ **No VRChat accounts linked**\n\nUse `/vrchat verify` to bind your VRChat account and unlock features!")
        .addFields({
          name: "Available Actions",
          value: "🔗 **Bind Account**: Link instantly with `/vrchat verify`\n🛡️ **Verify Ownership**: Prove ownership for premium features",
          inline: false
        });
    } else {
      const boundCount = status.boundAccounts.length;
      const verifiedCount = status.verifiedAccounts.length;
      
      embed.setDescription(
        `✅ **${boundCount} account${boundCount > 1 ? 's' : ''} bound**\n` +
        `${status.hasVerifiedAccount ? '🛡️' : '⚠️'} **${verifiedCount} account${verifiedCount > 1 ? 's' : ''} verified**`
      );

      // Account details
      let accountDetails = "";
      for (const account of status.boundAccounts) {
        const verifiedIcon = (account.accountType === "MAIN" || account.accountType === "ALT") ? "🛡️" : "🔗";
        const statusText = (account.accountType === "MAIN" || account.accountType === "ALT") ? "Verified" : "Bound only";
        accountDetails += `${verifiedIcon} **${account.accountType}**: \`${account.vrcUserId}\` (${statusText})\n`;
      }
      
      embed.addFields({ name: "Your Accounts", value: accountDetails || "None", inline: false });

      if (!status.hasVerifiedAccount) {
        embed.addFields({
          name: "🛡️ Want Premium Features?",
          value: "Use `/vrchat verify` and choose 'Verify Ownership' to unlock enhanced features!",
          inline: false
        });
      } else {
        embed.addFields({
          name: "🎉 Premium Features Unlocked!",
          value: "You have access to all verified account features!",
          inline: false
        });
      }
    }

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral
    });
  }
}
